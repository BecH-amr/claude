"""Tests for /api/queues: CRUD, ownership, public read, QR PNG."""

from httpx import AsyncClient

from .conftest import make_queue, register


async def test_create_queue_starts_closed(client: AsyncClient) -> None:
    auth = await register(client)
    r = await client.post(
        "/api/queues",
        json={"name": "Cuts", "max_capacity": 10},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Cuts"
    assert body["status"] == "closed"
    assert body["max_capacity"] == 10
    assert body["current_ticket_number"] == 0
    assert body["now_serving"] is None


async def test_public_queue_view_no_pii(client: AsyncClient) -> None:
    """The public read returns business_name + counts; never raw owner info."""
    auth = await register(client, name="Joe Barber")
    qid = await make_queue(client, auth["headers"])

    r = await client.get(f"/api/queues/{qid}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == qid
    assert body["business_name"] == "Joe Barber"
    assert body["status"] == "open"
    assert body["waiting_count"] == 0
    # Business phone / address must NOT leak in the public view.
    assert "phone" not in body
    assert "address" not in body


async def test_get_unknown_queue_404(client: AsyncClient) -> None:
    r = await client.get("/api/queues/9999")
    assert r.status_code == 404


async def test_patch_queue(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"], open_now=False)
    r = await client.patch(
        f"/api/queues/{qid}",
        json={"name": "New name", "max_capacity": 5},
        headers=auth["headers"],
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New name"
    assert r.json()["max_capacity"] == 5


async def test_patch_queue_other_business_403(client: AsyncClient) -> None:
    a = await register(client, phone="+22220000111", name="A")
    b = await register(client, phone="+22220000222", name="B")
    qid = await make_queue(client, a["headers"])

    r = await client.patch(
        f"/api/queues/{qid}",
        json={"name": "stolen"},
        headers=b["headers"],
    )
    assert r.status_code == 403


async def test_open_close_lifecycle(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"], open_now=False)

    r = await client.post(f"/api/queues/{qid}/open", headers=auth["headers"])
    assert r.status_code == 200 and r.json()["status"] == "open"
    r = await client.post(f"/api/queues/{qid}/close", headers=auth["headers"])
    assert r.status_code == 200 and r.json()["status"] == "closed"


async def test_open_other_business_403(client: AsyncClient) -> None:
    a = await register(client, phone="+22220000111")
    b = await register(client, phone="+22220000222")
    qid = await make_queue(client, a["headers"], open_now=False)

    r = await client.post(f"/api/queues/{qid}/open", headers=b["headers"])
    assert r.status_code == 403


async def test_list_my_queues_only_returns_own(client: AsyncClient) -> None:
    a = await register(client, phone="+22220000111")
    b = await register(client, phone="+22220000222")
    a_qid = await make_queue(client, a["headers"], name="A's queue")
    await make_queue(client, b["headers"], name="B's queue")

    r = await client.get("/api/queues/mine", headers=a["headers"])
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == a_qid
    assert body[0]["name"] == "A's queue"


async def test_qr_endpoint_returns_png(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])

    r = await client.get(f"/api/queues/{qid}/qr")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    # PNG magic
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


async def test_max_capacity_validation(client: AsyncClient) -> None:
    auth = await register(client)
    # ge=1 on QueueCreate
    r = await client.post(
        "/api/queues",
        json={"name": "X", "max_capacity": 0},
        headers=auth["headers"],
    )
    assert r.status_code == 422
