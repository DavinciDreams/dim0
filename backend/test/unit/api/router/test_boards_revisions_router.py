"""API tests for the read-only note revisions listing endpoint."""

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from topix.api.router.boards import router
from topix.api.utils.security import get_current_user_uid
from topix.datatypes.graph.graph import Graph
from topix.datatypes.note.note import Note
from topix.datatypes.resource import RichText


class _FakeGraphStore:
    """Minimal async store: roles, metadata, one current note, and its revisions."""

    def __init__(self):
        """Seed a private board g-1 with note n-1 and two older revisions."""
        self.roles = {("g-1", "owner"): "owner"}
        self.current = Note(id="n-1", graph_uid="g-1", label=RichText(markdown="Now"), content=RichText(markdown="v3"))
        self.revisions = [
            ("r-2", datetime(2026, 9, 26, 12, tzinfo=timezone.utc), Note(id="n-1", graph_uid="g-1", content=RichText(markdown="v2"))),
            ("r-1", datetime(2026, 9, 26, 9, tzinfo=timezone.utc), Note(id="n-1", graph_uid="g-1", content=RichText(markdown="v1"))),
        ]
        self.restored = False

    async def get_graph_role(self, graph_uid: str, user_uid: str) -> str | None:
        """Look up the caller's role."""
        return self.roles.get((graph_uid, user_uid))

    async def get_graph_metadata(self, graph_uid: str) -> Graph | None:
        """Return a private board."""
        return Graph(uid=graph_uid, label="Board", visibility="private")

    async def get_nodes(self, ids: list[str]) -> list[Note]:
        """Resolve the one current note."""
        return [self.current] if "n-1" in ids else []

    async def list_note_revisions(self, node_id: str):
        """Return seeded revisions newest-first."""
        return self.revisions if node_id == "n-1" else []


def _client(store: _FakeGraphStore, user_uid: str) -> TestClient:
    """Mount the boards router over the fake store, authenticated as `user_uid`."""
    app = FastAPI()
    app.include_router(router)
    app.graph_store = store

    async def _uid():
        return user_uid

    app.dependency_overrides[get_current_user_uid] = _uid
    return TestClient(app)


def test_lists_revisions_newest_first_for_readers():
    """A member gets every revision's content without anything being restored."""
    store = _FakeGraphStore()
    resp = _client(store, "owner").get("/boards/g-1/notes/n-1/revisions")
    assert resp.status_code == 200
    revisions = resp.json()["data"]["revisions"]
    assert [r["id"] for r in revisions] == ["r-2", "r-1"]
    assert revisions[0]["content"] == "v2"
    assert revisions[0]["created_at"].startswith("2026-09-26T12:00")


def test_non_members_of_private_boards_get_404():
    """No role on a private board → not found (no revision content leaks)."""
    resp = _client(_FakeGraphStore(), "stranger").get("/boards/g-1/notes/n-1/revisions")
    assert resp.status_code == 404


def test_note_on_another_board_is_404():
    """A note id from a different board can't be read through this board's route."""
    store = _FakeGraphStore()
    store.current = Note(id="n-1", graph_uid="other")
    resp = _client(store, "owner").get("/boards/g-1/notes/n-1/revisions")
    assert resp.status_code == 404
