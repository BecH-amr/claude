"""Shared fixtures for the backend test suite.

Each test gets its own SQLite-in-memory database (via aiosqlite) and a
fresh `AsyncClient` bound to the FastAPI app through `ASGITransport`.

The DB engine in `app.db` is rebound to a per-test in-memory engine so
the production module-level `SessionLocal` reuses our test connection
pool transparently — no app-code changes needed.
"""

from __future__ import annotations

import os
from typing import AsyncIterator

# slowapi reads its limit string at decorator import time. Make limits
# generous in tests so the timing-oracle suite (10+ login calls) and
# rate-limiting are not in conflict. Set BEFORE importing app.config.
os.environ.setdefault("RATE_LIMIT_LOGIN", "10000/minute")
os.environ.setdefault("RATE_LIMIT_JOIN", "10000/minute")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.db as app_db
from app.db import Base
from app import models  # noqa: F401  -- registers tables on Base.metadata


@pytest.fixture
async def engine_override() -> AsyncIterator[None]:
    """Rebind the app's engine + SessionLocal to a fresh in-memory DB.

    StaticPool + check_same_thread=False is required for aiosqlite + ":memory:"
    so every checkout returns the *same* connection — otherwise each new pool
    connection gets its own private database and our schema/data vanishes.
    """
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    test_sessionmaker = async_sessionmaker(test_engine, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    saved_engine = app_db.engine
    saved_sessionmaker = app_db.SessionLocal
    app_db.engine = test_engine
    app_db.SessionLocal = test_sessionmaker
    try:
        yield
    finally:
        app_db.engine = saved_engine
        app_db.SessionLocal = saved_sessionmaker
        await test_engine.dispose()


@pytest.fixture
async def client(engine_override: None) -> AsyncIterator[AsyncClient]:
    from app.main import app  # imported lazily so engine_override has effect

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        yield c


# --- helpers --------------------------------------------------------------


async def register(client: AsyncClient, *, phone: str = "+15550100", name: str = "Joe") -> dict:
    r = await client.post(
        "/api/auth/register",
        json={"name": name, "phone": phone, "password": "hunter22"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return {
        "token": body["access_token"],
        "headers": {"Authorization": f"Bearer {body['access_token']}"},
        "business": body["business"],
    }


async def make_queue(
    client: AsyncClient,
    headers: dict,
    *,
    name: str = "Cuts",
    max_capacity: int | None = None,
    close_on_max_reached: bool = False,
    open_now: bool = True,
) -> int:
    payload: dict = {"name": name, "close_on_max_reached": close_on_max_reached}
    if max_capacity is not None:
        payload["max_capacity"] = max_capacity
    r = await client.post("/api/queues", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    qid = r.json()["id"]
    if open_now:
        r = await client.post(f"/api/queues/{qid}/open", headers=headers)
        assert r.status_code == 200, r.text
    return qid
