"""Board MCP server: lets external agents (Claude Code, Codex, …) read and edit synced boards.

Served over streamable HTTP at `/mcp` on the main API and authenticated with the
same bearer access token as the REST API. Every mutation runs through the very
same tool implementations the server-side agent uses (`topix.agents.notes.tools`),
so it inherits their validation, the `expected_version` read-before-write guard,
and the collab bridge broadcast — a browser with the board open sees the edit live.

Local-only boards live in the browser (IndexedDB) and are not reachable here.
"""

from __future__ import annotations

import json
import os

from typing import Any
from urllib.parse import urlparse

from agents import FunctionTool
from agents.tool_context import ToolContext
from fastapi import FastAPI, HTTPException
from mcp.server.fastmcp import Context as McpContext
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings

from topix.agents.datatypes.context import Context as AgentContext
from topix.agents.notes.layout import rearrange_created_notes
from topix.agents.notes.tools import (
    create_delete_note_tool,
    create_edit_note_tool,
    create_get_note_tool,
    create_link_notes_tool,
    create_move_note_tool,
    create_unlink_notes_tool,
    create_write_note_tool,
    note_version,
)
from topix.api.utils.security import decode_and_validate_token
from topix.collab.agent_bridge import AgentBoardBridge
from topix.datatypes.note.note import Note
from topix.datatypes.note.style import NodeType
from topix.store.graph import GraphStore

MCP_PATH = "/mcp"

# Per-note body preview in `read_board`; `get_note` returns the full body.
_SNIPPET_CHARS = 300
# Cap on notes returned by one `read_board` call (one layer of one board).
_MAX_BOARD_NOTES = 300

_WRITE_ROLES = frozenset({"owner", "member"})
_READ_ROLES = frozenset({"owner", "member", "viewer"})

INSTRUCTIONS = """\
Tools for reading and editing the user's Dim0 whiteboards (synced boards only).

- Start with `list_boards`, then `read_board` to see a board's notes and links. Boards have
  folders (notes of type "folder"); pass `folder_id` to read or write inside one.
- Always address notes by id, never by label.
- Before rewriting, editing, or deleting a note you read earlier, pass its `version` as
  `expected_version`. If the call is refused because the note changed, the user edited it:
  re-read it and apply your change to the current content instead of re-sending your copy.
- New notes land at the board origin; after creating a batch of notes (and links between
  them), call `arrange_notes` with their ids to lay them out.
- Only delete notes or links when the user asked for it.
"""


_LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "[::1]")


def _transport_security() -> TransportSecuritySettings:
    """DNS-rebinding protection with an explicit Host/Origin allowlist.

    Allows loopback on any port, the hosts of `API_ORIGIN` / `APP_BASE_URL`, and any
    extra `MCP_ALLOWED_HOSTS` (comma-separated `host` or `host:port`, for deployments
    behind a proxy). Anything else is refused before it reaches a tool.
    """
    hosts: set[str] = set()
    origins: set[str] = set()
    for host in _LOOPBACK_HOSTS:
        hosts.update({host, f"{host}:*"})
        origins.update({f"http://{host}:*", f"https://{host}:*", f"http://{host}", f"https://{host}"})
    for var in ("API_ORIGIN", "APP_BASE_URL"):
        parsed = urlparse(os.getenv(var, ""))
        if parsed.scheme and parsed.netloc:
            hosts.update({parsed.netloc, parsed.hostname or parsed.netloc})
            origins.add(f"{parsed.scheme}://{parsed.netloc}")
    for extra in os.getenv("MCP_ALLOWED_HOSTS", "").split(","):
        if extra.strip():
            hosts.add(extra.strip())
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True, allowed_hosts=sorted(hosts), allowed_origins=sorted(origins),
    )


def _note_summary(note: Note) -> dict[str, Any]:
    """Compact, model-facing view of a note: identity, type, geometry, preview, version."""
    props = note.properties
    position = getattr(getattr(props, "node_position", None), "position", None)
    size = getattr(getattr(props, "node_size", None), "size", None)
    content = note.content.markdown if note.content else ""
    return {
        "id": note.id,
        "label": note.label.markdown if note.label else None,
        "type": "document" if note.type == "document" else str(note.style.type),
        "parent_id": note.parent_id,
        "x": getattr(position, "x", None),
        "y": getattr(position, "y", None),
        "w": getattr(size, "width", None),
        "h": getattr(size, "height", None),
        "content_preview": content[:_SNIPPET_CHARS],
        "content_truncated": len(content) > _SNIPPET_CHARS,
        "version": note_version(note),
    }


async def _invoke(tool: FunctionTool, args: dict[str, Any]) -> dict[str, Any]:
    """Run an agent FunctionTool with JSON args; raise ToolError on its error string."""
    payload = json.dumps({k: v for k, v in args.items() if v is not None})
    ctx = ToolContext(context=AgentContext(), tool_name=tool.name, tool_call_id="mcp", tool_arguments=payload)
    result = await tool.on_invoke_tool(ctx, payload)
    # The agents SDK reports a raised ValueError as a plain error string; every
    # successful note tool returns a pydantic output model.
    if isinstance(result, str):
        raise ToolError(result)
    return result.model_dump(mode="json")


def create_board_mcp(app: FastAPI) -> FastMCP:  # noqa: C901 — one small closure per tool; the count is the "complexity"
    """Build the board MCP server bound to `app`'s stores (resolved lazily, after lifespan setup)."""
    mcp = FastMCP(
        name="dim0",
        instructions=INSTRUCTIONS,
        streamable_http_path=MCP_PATH,
        stateless_http=True,
        json_response=True,
        transport_security=_transport_security(),
    )

    def graph_store() -> GraphStore:
        return app.graph_store  # type: ignore[attr-defined]

    def bridge() -> AgentBoardBridge:
        return app.agent_board_bridge  # type: ignore[attr-defined]

    def user_uid(ctx: McpContext) -> str:
        """Resolve the caller from the request's bearer access token."""
        request = ctx.request_context.request
        header = request.headers.get("authorization", "") if request is not None else ""
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise ToolError("Missing bearer token: configure the MCP client with an 'Authorization: Bearer <access token>' header.")
        try:
            payload = decode_and_validate_token(token, expected_type="access")
        except HTTPException as exc:
            raise ToolError(f"Invalid access token: {exc.detail}") from exc
        uid = payload.get("sub")
        if not uid:
            raise ToolError("Invalid access token: no subject.")
        return uid

    async def require_access(ctx: McpContext, board_id: str, *, write: bool) -> str:
        """Check the caller's board role (owners/members write; viewers + public boards read)."""
        uid = user_uid(ctx)
        role = await graph_store().get_graph_role(graph_uid=board_id, user_uid=uid)
        if role in (_WRITE_ROLES if write else _READ_ROLES):
            return uid
        if not write:
            graph = await graph_store().get_graph_metadata(graph_uid=board_id)
            if graph is not None and graph.deleted_at is None and graph.visibility == "public":
                return uid
        # Same answer for "missing" and "forbidden" so ids can't be probed.
        raise ToolError(f"Board {board_id} not found or not {'editable' if write else 'readable'} by you.")

    async def require_folder(board_id: str, folder_id: str | None) -> None:
        """Validate that `folder_id` (when given) is a folder on this board."""
        if folder_id is None:
            return
        nodes = await graph_store().get_nodes([folder_id])
        if not nodes or nodes[0].graph_uid != board_id or nodes[0].style.type != NodeType.FOLDER:
            raise ToolError(f"Folder {folder_id} not found on board {board_id}.")

    @mcp.tool()
    async def list_boards(ctx: McpContext) -> list[dict[str, Any]]:
        """List the synced boards you can access, with your role on each."""
        rows = await graph_store().list_graphs(user_uid=user_uid(ctx))
        return [{"board_id": graph.uid, "label": graph.label, "role": role} for graph, role, _ in rows]

    @mcp.tool()
    async def read_board(ctx: McpContext, board_id: str, folder_id: str | None = None) -> dict[str, Any]:
        """Read one layer of a board: its notes (with previews and versions) and links.

        Omit folder_id for the top level; pass a folder note's id to read inside it.
        """
        await require_access(ctx, board_id, write=False)
        await require_folder(board_id, folder_id)
        graph = await graph_store().get_graph(graph_uid=board_id, root_id=folder_id)
        if graph is None:
            raise ToolError(f"Board {board_id} not found.")
        notes = graph.nodes[:_MAX_BOARD_NOTES]
        return {
            "board_id": board_id,
            "label": graph.label,
            "folder_id": folder_id,
            "notes": [_note_summary(n) for n in notes],
            "notes_truncated": len(graph.nodes) > _MAX_BOARD_NOTES,
            "links": [
                {"id": e.id, "source": e.source, "target": e.target, "label": e.label.markdown if e.label else None}
                for e in graph.edges
            ],
        }

    @mcp.tool()
    async def get_note(ctx: McpContext, board_id: str, note_id: str) -> dict[str, Any]:
        """Read a note's full label, content, type, and version."""
        await require_access(ctx, board_id, write=False)
        return await _invoke(create_get_note_tool(graph_store(), board_id), {"note_id": note_id})

    @mcp.tool()
    async def write_note(
        ctx: McpContext,
        board_id: str,
        content: str,
        label: str | None = None,
        note_type: NodeType = NodeType.RECTANGLE,
        note_id: str | None = None,
        expected_version: str | None = None,
        folder_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a note (omit note_id) or fully rewrite one (pass note_id, ideally with expected_version).

        note_type: rectangle, sheet (long-form rich text), ellipse, diamond, code-sandbox, …
        folder_id places a NEW note inside that folder.
        """
        await require_access(ctx, board_id, write=True)
        await require_folder(board_id, folder_id)
        tool = create_write_note_tool(graph_store(), board_id, root_id=folder_id, agent_bridge=bridge())
        return await _invoke(tool, {
            "content": content, "label": label, "note_type": note_type,
            "note_id": note_id, "expected_version": expected_version,
        })

    @mcp.tool()
    async def edit_note(
        ctx: McpContext,
        board_id: str,
        note_id: str,
        field: str,
        old: str,
        new: str,
        replace_all: bool = False,
        expected_version: str | None = None,
    ) -> dict[str, Any]:
        """Replace a unique substring `old` with `new` in a note's "content" or "label"."""
        await require_access(ctx, board_id, write=True)
        tool = create_edit_note_tool(graph_store(), board_id, agent_bridge=bridge())
        return await _invoke(tool, {
            "note_id": note_id, "field": field, "old": old, "new": new,
            "replace_all": replace_all, "expected_version": expected_version,
        })

    @mcp.tool()
    async def link_notes(
        ctx: McpContext,
        board_id: str,
        source_id: str,
        target_id: str,
        label: str | None = None,
        folder_id: str | None = None,
    ) -> dict[str, Any]:
        """Draw a directed arrow between two notes (folder_id = the folder both notes are in)."""
        await require_access(ctx, board_id, write=True)
        await require_folder(board_id, folder_id)
        tool = create_link_notes_tool(graph_store(), board_id, root_id=folder_id, agent_bridge=bridge())
        return await _invoke(tool, {"source_id": source_id, "target_id": target_id, "label": label})

    @mcp.tool()
    async def delete_note(ctx: McpContext, board_id: str, note_id: str, expected_version: str | None = None) -> dict[str, Any]:
        """Delete a note and its links. Folders and documents are refused."""
        await require_access(ctx, board_id, write=True)
        tool = create_delete_note_tool(graph_store(), board_id, agent_bridge=bridge())
        return await _invoke(tool, {"note_id": note_id, "expected_version": expected_version})

    @mcp.tool()
    async def move_note(ctx: McpContext, board_id: str, note_id: str, x: float, y: float) -> dict[str, Any]:
        """Move a note's top-left corner to (x, y) in canvas coordinates."""
        await require_access(ctx, board_id, write=True)
        tool = create_move_note_tool(graph_store(), board_id, agent_bridge=bridge())
        return await _invoke(tool, {"note_id": note_id, "x": x, "y": y})

    @mcp.tool()
    async def unlink_notes(ctx: McpContext, board_id: str, link_id: str) -> dict[str, Any]:
        """Remove a link by id."""
        await require_access(ctx, board_id, write=True)
        tool = create_unlink_notes_tool(graph_store(), board_id, agent_bridge=bridge())
        return await _invoke(tool, {"link_id": link_id})

    @mcp.tool()
    async def arrange_notes(
        ctx: McpContext, board_id: str, note_ids: list[str], folder_id: str | None = None,
    ) -> dict[str, Any]:
        """Auto-lay-out the given notes (e.g. ones you just created) below the existing content.

        Links among them shape the layout; notes they link to outside the set stay put as anchors.
        """
        await require_access(ctx, board_id, write=True)
        await require_folder(board_id, folder_id)
        graph = await graph_store().get_graph(graph_uid=board_id, root_id=folder_id)
        wanted = set(note_ids)
        link_ids = [e.id for e in (graph.edges if graph else []) if e.source in wanted or e.target in wanted]
        moved = await rearrange_created_notes(
            graph_store(), board_id, note_ids, created_link_ids=link_ids, root_id=folder_id, agent_bridge=bridge(),
        )
        return {"arranged": moved}

    return mcp
