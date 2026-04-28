"""WebSocket tests using FastAPI's TestClient (sync, but underlying async OK).

We don't run a real uvicorn here — `TestClient.websocket_connect` drives the
ASGI app directly, which is enough to verify routing, auth, and broadcast
payload shape.
"""

import asyncio
import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.db as app_db
from app import models  # noqa: F401  -- registers tables on Base.metadata
from app.db import Base


@pytest.fixture
def ws_app():
    """Engine override + app for the synchronous TestClient.

    TestClient drives the ASGI app in a background event loop and reads
    responses from the calling thread. With ":memory:" SQLite that loop's
    connections wouldn't share state with our setup connection, so we use a
    short-lived temp file — simpler and more obvious than juggling StaticPool
    plus loop state across threads.
    """
    fd, path = tempfile.mkstemp(prefix="qtest-", suffix=".db")
    os.close(fd)
    test_engine = create_async_engine(
        f"sqlite+aiosqlite:///{path}", future=True
    )
    test_sessionmaker = async_sessionmaker(test_engine, expire_on_commit=False)

    # Create schema using the synchronous sqlite3 driver so we don't bind
    # any aiosqlite connection to a now-dead event loop. After this runs,
    # the file has the tables; the async engine will open fresh connections
    # against it on whatever loop TestClient ends up using.
    import sqlite3
    from sqlalchemy import create_engine

    sync_engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()

    saved_engine = app_db.engine
    saved_sessionmaker = app_db.SessionLocal
    app_db.engine = test_engine
    app_db.SessionLocal = test_sessionmaker

    from app.main import app

    try:
        yield app
    finally:
        app_db.engine = saved_engine
        app_db.SessionLocal = saved_sessionmaker
        # Don't dispose the async engine here — its pool is bound to a loop
        # that is closing along with the test. Just remove the file.
        try:
            os.remove(path)
        except OSError:
            pass


def test_queue_ws_unknown_queue_closes_with_1008(ws_app) -> None:
    tc = TestClient(ws_app)
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc:
        with tc.websocket_connect("/api/ws/queue/9999") as ws:
            ws.receive_text()
    assert exc.value.code == 1008


def test_dashboard_ws_no_token_closes_with_1008(ws_app) -> None:
    tc = TestClient(ws_app)
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc:
        with tc.websocket_connect("/api/ws/dashboard/1") as ws:
            ws.receive_text()
    assert exc.value.code == 1008


def test_dashboard_ws_garbage_token_closes_with_1008(ws_app) -> None:
    tc = TestClient(ws_app)
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc:
        with tc.websocket_connect("/api/ws/dashboard/1?token=garbage") as ws:
            ws.receive_text()
    assert exc.value.code == 1008


def test_queue_ws_receives_join_broadcast(ws_app) -> None:
    """End-to-end: open WS, fire a join via the same TestClient, receive event."""
    tc = TestClient(ws_app)

    # Set up business + queue via HTTP first.
    r = tc.post(
        "/api/auth/register",
        json={"name": "Joe", "phone": "+15550100", "password": "hunter22"},
    )
    assert r.status_code == 201
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    qid = tc.post("/api/queues", json={"name": "Cuts"}, headers=h).json()["id"]
    assert tc.post(f"/api/queues/{qid}/open", headers=h).status_code == 200

    with tc.websocket_connect(f"/api/ws/queue/{qid}") as ws:
        # Fire a join in a thread so the WS receive can read the broadcast.
        # TestClient is sync; running the join on the same TestClient works
        # because each request is a fresh ASGI scope.
        import threading

        result = {}

        def do_join():
            r = tc.post(f"/api/queues/{qid}/join", json={})
            result["status"] = r.status_code

        t = threading.Thread(target=do_join, daemon=True)
        t.start()
        msg = ws.receive_json()
        t.join(timeout=5)

        assert msg["event"] == "ticket.joined"
        assert msg["queue_id"] == qid
        assert msg["waiting_count"] == 1
        # Broadcast doesn't carry PII.
        assert "customer_name" not in msg
        assert "customer_phone" not in msg


def test_dashboard_ws_cross_business_closes_with_1008(ws_app) -> None:
    tc = TestClient(ws_app)

    a = tc.post(
        "/api/auth/register",
        json={"name": "A", "phone": "+15550111", "password": "hunter22"},
    ).json()
    b = tc.post(
        "/api/auth/register",
        json={"name": "B", "phone": "+15550222", "password": "hunter22"},
    ).json()
    qid = tc.post(
        "/api/queues",
        json={"name": "Cuts"},
        headers={"Authorization": f"Bearer {a['access_token']}"},
    ).json()["id"]

    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc:
        # B authenticates but tries to subscribe to A's queue dashboard.
        with tc.websocket_connect(
            f"/api/ws/dashboard/{qid}?token={b['access_token']}"
        ) as ws:
            ws.receive_text()
    assert exc.value.code == 1008
