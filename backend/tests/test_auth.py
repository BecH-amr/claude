"""Tests for /api/auth: register, login, ownership-bearing token lookup."""

import time

import pytest
from httpx import AsyncClient

from .conftest import register


async def test_register_returns_token_and_business(client: AsyncClient) -> None:
    r = await client.post(
        "/api/auth/register",
        json={"name": "Joe", "phone": "+22220000100", "password": "hunter22"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["business"]["phone"] == "+22220000100"
    assert body["business"]["name"] == "Joe"


async def test_register_duplicate_phone_returns_409(client: AsyncClient) -> None:
    payload = {"name": "Joe", "phone": "+22220000100", "password": "hunter22"}
    r1 = await client.post("/api/auth/register", json=payload)
    assert r1.status_code == 201
    r2 = await client.post("/api/auth/register", json=payload)
    assert r2.status_code == 409
    assert "registered" in r2.json()["detail"].lower()


async def test_register_validation(client: AsyncClient) -> None:
    # Password too short
    r = await client.post(
        "/api/auth/register",
        json={"name": "Joe", "phone": "+22220000100", "password": "x"},
    )
    assert r.status_code == 422
    # Empty name
    r = await client.post(
        "/api/auth/register",
        json={"name": "", "phone": "+22220000100", "password": "hunter22"},
    )
    assert r.status_code == 422


async def test_login_happy_path(client: AsyncClient) -> None:
    await register(client)
    r = await client.post(
        "/api/auth/login",
        json={"phone": "+22220000100", "password": "hunter22"},
    )
    assert r.status_code == 200
    assert r.json()["access_token"]


async def test_login_wrong_password_returns_401(client: AsyncClient) -> None:
    await register(client)
    r = await client.post(
        "/api/auth/login",
        json={"phone": "+22220000100", "password": "wrong"},
    )
    assert r.status_code == 401


async def test_login_unknown_phone_returns_401(client: AsyncClient) -> None:
    r = await client.post(
        "/api/auth/login",
        json={"phone": "+22249999999", "password": "whatever"},
    )
    assert r.status_code == 401


async def test_login_constant_time_against_unknown_phone(client: AsyncClient) -> None:
    """Regression test for the timing oracle fix.

    The miss path (unknown phone) and the wrong-password path (known phone)
    must both run a bcrypt verify so an attacker can't enumerate registered
    phones via response time. We don't assert exact timings (sandbox CI is
    noisy) but we do assert the ratio is sane (<3x), which is more than
    enough headroom — the unfixed version showed a >100x ratio because the
    miss path skipped bcrypt entirely.
    """
    await register(client)

    def time_n(fn, n=3):
        t0 = time.perf_counter()
        for _ in range(n):
            fn()
        return (time.perf_counter() - t0) / n

    miss_calls = []
    wrong_calls = []

    async def miss():
        r = await client.post(
            "/api/auth/login",
            json={"phone": "+22249999999", "password": "whatever"},
        )
        assert r.status_code == 401
        miss_calls.append(r)

    async def wrong():
        r = await client.post(
            "/api/auth/login",
            json={"phone": "+22220000100", "password": "wrongpass"},
        )
        assert r.status_code == 401
        wrong_calls.append(r)

    # Warmup (bcrypt cost is large enough that first call is comparable).
    for _ in range(2):
        await miss()
        await wrong()

    import asyncio

    async def loop_n(coro_factory, n):
        t0 = time.perf_counter()
        for _ in range(n):
            await coro_factory()
        return (time.perf_counter() - t0) / n

    miss_avg = await loop_n(miss, 3)
    wrong_avg = await loop_n(wrong, 3)
    ratio = max(miss_avg, wrong_avg) / max(min(miss_avg, wrong_avg), 1e-6)
    # 3x is a generous ceiling — pre-fix this was 100x+. Realistic is ~1.05x.
    assert ratio < 3.0, f"timing oracle suspected: miss={miss_avg} wrong={wrong_avg} ratio={ratio}"


async def test_owner_endpoint_rejects_missing_token(client: AsyncClient) -> None:
    r = await client.get("/api/queues/mine")
    assert r.status_code == 401


async def test_owner_endpoint_rejects_garbage_token(client: AsyncClient) -> None:
    r = await client.get("/api/queues/mine", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401
