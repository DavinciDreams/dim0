"""End-to-end tests for the board MCP server over its real streamable-HTTP route."""

from __future__ import annotations

import asyncio
import json

from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock

import pytest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from topix.agents.notes.tools import note_version
from topix.datatypes.note.note import Note
from topix.datatypes.resource import RichText
from topix.mcp_server import board_mcp
from topix.mcp_server.board_mcp import MCP_PATH, create_board_mcp

TOKENS = {"tok-owner": "owner-uid", "tok-viewer": "viewer-uid", "tok-stranger": "stranger-uid"}
ROLES = {"owner-uid": "owner", "viewer-uid": "viewer"}


class FakeGraphStore:
    """Just enough GraphStore for the MCP tools: one board, role lookup, note CRUD."""

    def __init__(self) -> None:
        """Seed one private board with one note."""
        self.note = Note(id="note-1", graph_uid="board-1", label=RichText(markdown="Title"), content=RichText(markdown="body"))
        self.patch_note = AsyncMock(return_value=self.note)
        self.delete_node = AsyncMock()
        self._locks: dict[str, asyncio.Lock] = {}

    async def get_graph_role(self, graph_uid: str, user_uid: str) -> str | None:
        """Role on board-1 per ROLES; nothing elsewhere."""
        return ROLES.get(user_uid) if graph_uid == "board-1" else None

    async def get_graph_metadata(self, graph_uid: str):
        """Return a private board (so non-members get nothing)."""
        return type("Graph", (), {"deleted_at": None, "visibility": "private"})()

    async def get_nodes(self, ids: list[str]) -> list[Note]:
        """Resolve only the seeded note."""
        return [self.note] if "note-1" in ids else []

    def note_lock(self, note_id: str) -> asyncio.Lock:
        """Per-note lock, mirroring GraphStore."""
        return self._locks.setdefault(note_id, asyncio.Lock())


def _decode(token: str, expected_type: str) -> dict[str, Any]:
    """Stand-in for JWT validation: known tokens map to a subject."""
    if token not in TOKENS:
        raise HTTPException(status_code=401, detail="bad token")
    return {"sub": TOKENS[token]}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    """Serve only the MCP route from a FastAPI app over fake stores."""
    monkeypatch.setattr(board_mcp, "decode_and_validate_token", _decode)
    app = FastAPI()
    app.graph_store = FakeGraphStore()  # type: ignore[attr-defined]
    app.agent_board_bridge = None  # type: ignore[attr-defined]  # tools fall back to graph_store
    mcp = create_board_mcp(app)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        async with mcp.session_manager.run():
            yield

    app.router.lifespan_context = lifespan
    app.router.routes.extend(mcp.streamable_http_app().routes)
    with TestClient(app, base_url="http://localhost:8081") as test_client:
        yield test_client, app


def _call(test_client: TestClient, tool: str, args: dict[str, Any], token: str | None = "tok-owner") -> dict[str, Any]:
    """POST one JSON-RPC tools/call and return its `result`."""
    headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}
    resp = test_client.post(MCP_PATH, headers=headers, content=json.dumps(body))
    assert resp.status_code == 200, resp.text
    return resp.json()["result"]


def _text(result: dict[str, Any]) -> str:
    """Concatenate a tool result's text content."""
    return "".join(c.get("text", "") for c in result["content"])


def test_get_note_returns_version(client) -> None:
    """A member can read a note, including the version for later guarded writes."""
    test_client, app = client
    result = _call(test_client, "get_note", {"board_id": "board-1", "note_id": "note-1"})
    assert not result.get("isError")
    assert note_version(app.graph_store.note) in _text(result)


def test_missing_token_is_refused(client) -> None:
    """No bearer token → a tool error, nothing read."""
    test_client, _ = client
    result = _call(test_client, "get_note", {"board_id": "board-1", "note_id": "note-1"}, token=None)
    assert result["isError"] is True
    assert "Missing bearer token" in _text(result)


def test_stranger_cannot_read_private_board(client) -> None:
    """A valid user with no role on a private board gets the same not-found answer."""
    test_client, _ = client
    result = _call(test_client, "get_note", {"board_id": "board-1", "note_id": "note-1"}, token="tok-stranger")
    assert result["isError"] is True
    assert "not found or not readable" in _text(result)


def test_viewer_can_read_but_not_write(client) -> None:
    """Viewers read; every mutation is refused before reaching the store."""
    test_client, app = client
    assert not _call(test_client, "get_note", {"board_id": "board-1", "note_id": "note-1"}, token="tok-viewer").get("isError")
    result = _call(test_client, "delete_note", {"board_id": "board-1", "note_id": "note-1"}, token="tok-viewer")
    assert result["isError"] is True
    app.graph_store.delete_node.assert_not_awaited()


def test_stale_expected_version_is_refused(client) -> None:
    """The agent tools' read-before-write guard applies over MCP too."""
    test_client, app = client
    result = _call(test_client, "edit_note", {
        "board_id": "board-1", "note_id": "note-1", "field": "content", "old": "body", "new": "x",
        "expected_version": "000000000000",
    })
    assert result["isError"] is True
    assert "changed since you read it" in _text(result)
    app.graph_store.patch_note.assert_not_awaited()


def test_owner_edit_applies(client) -> None:
    """An owner's edit with the current version goes through the shared tool."""
    test_client, app = client
    version = note_version(app.graph_store.note)
    result = _call(test_client, "edit_note", {
        "board_id": "board-1", "note_id": "note-1", "field": "content", "old": "body", "new": "new body",
        "expected_version": version,
    })
    assert not result.get("isError"), _text(result)
    app.graph_store.patch_note.assert_awaited_once_with("note-1", {"content": {"markdown": "new body"}})


def test_foreign_host_is_rejected(client) -> None:
    """DNS-rebinding protection: an unlisted Host header never reaches a tool."""
    test_client, _ = client
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "Authorization": "Bearer tok-owner",
        "Host": "evil.example",
    }
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    resp = test_client.post(MCP_PATH, headers=headers, content=json.dumps(body))
    assert resp.status_code in (400, 421)
