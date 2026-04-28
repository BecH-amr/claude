"""Tests for ticket flows: join, position, call-next, complete, no-show, walk-in."""

from httpx import AsyncClient

from .conftest import make_queue, register


# --- join ----------------------------------------------------------------


async def test_join_open_queue_returns_ticket_without_pii(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])

    r = await client.post(
        f"/api/queues/{qid}/join",
        json={"customer_name": "Alice", "customer_phone": "+15550001"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["queue_id"] == qid
    assert body["ticket_number"] == 1
    assert body["status"] == "waiting"
    assert body["source"] == "app"
    # Public response strips PII because ticket IDs are guessable integers.
    assert "customer_name" not in body
    assert "customer_phone" not in body


async def test_join_anonymous(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])
    r = await client.post(f"/api/queues/{qid}/join", json={})
    assert r.status_code == 201


async def test_join_closed_queue_400(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"], open_now=False)
    r = await client.post(f"/api/queues/{qid}/join", json={})
    assert r.status_code == 400


async def test_join_full_queue_400(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"], max_capacity=2)
    for _ in range(2):
        assert (await client.post(f"/api/queues/{qid}/join", json={})).status_code == 201
    r = await client.post(f"/api/queues/{qid}/join", json={})
    assert r.status_code == 400


async def test_join_unknown_queue_404(client: AsyncClient) -> None:
    r = await client.post("/api/queues/9999/join", json={})
    assert r.status_code == 404


async def test_close_on_max_reached_auto_closes(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(
        client, auth["headers"], max_capacity=2, close_on_max_reached=True
    )
    for _ in range(2):
        assert (await client.post(f"/api/queues/{qid}/join", json={})).status_code == 201

    pub = (await client.get(f"/api/queues/{qid}")).json()
    assert pub["status"] == "closed"
    assert pub["waiting_count"] == 2


# --- position calculation ------------------------------------------------


async def test_ticket_status_position_recalculates_after_call_next(
    client: AsyncClient,
) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])

    tids = []
    for _ in range(3):
        tids.append((await client.post(f"/api/queues/{qid}/join", json={})).json()["id"])

    for i, tid in enumerate(tids):
        body = (await client.get(f"/api/tickets/{tid}")).json()
        assert body["position"] == i + 1
        assert body["waiting_count"] == 3
        # PII not surfaced on the public status either.
        assert "customer_name" not in body["ticket"]
        assert "customer_phone" not in body["ticket"]

    # Call next: A becomes called → position = None for A, positions shift down.
    r = await client.post(f"/api/queues/{qid}/call-next", headers=auth["headers"])
    assert r.status_code == 200

    a = (await client.get(f"/api/tickets/{tids[0]}")).json()
    assert a["position"] is None  # A is called, not waiting
    assert a["ticket"]["status"] == "called"

    b = (await client.get(f"/api/tickets/{tids[1]}")).json()
    assert b["position"] == 1
    c = (await client.get(f"/api/tickets/{tids[2]}")).json()
    assert c["position"] == 2


async def test_position_for_passed_over_returns_null(client: AsyncClient) -> None:
    """Regression: previously clamped to 1 forever, surfacing 'you're next' to skipped customers."""
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])

    # Three customers join.
    tids = [
        (await client.post(f"/api/queues/{qid}/join", json={})).json()["id"]
        for _ in range(3)
    ]

    # Call ticket 1, no-show it. Now's now_serving=1.
    r = await client.post(f"/api/queues/{qid}/call-next", headers=auth["headers"])
    assert r.status_code == 200 and r.json()["ticket_number"] == 1
    r = await client.post(f"/api/tickets/{tids[0]}/no-show", headers=auth["headers"])
    assert r.status_code == 200

    # Ticket 1 is no longer "waiting" — position is None.
    body = (await client.get(f"/api/tickets/{tids[0]}")).json()
    assert body["ticket"]["status"] == "no_show"
    assert body["position"] is None


# --- complete / no-show guards ------------------------------------------


async def test_complete_requires_called_or_serving(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])
    tid = (await client.post(f"/api/queues/{qid}/join", json={})).json()["id"]

    r = await client.post(f"/api/tickets/{tid}/complete", headers=auth["headers"])
    assert r.status_code == 400
    assert "waiting" in r.json()["detail"].lower()


async def test_no_show_requires_waiting_or_called(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])
    tid = (await client.post(f"/api/queues/{qid}/join", json={})).json()["id"]
    await client.post(f"/api/queues/{qid}/call-next", headers=auth["headers"])
    await client.post(f"/api/tickets/{tid}/complete", headers=auth["headers"])

    # Already completed → can't no-show.
    r = await client.post(f"/api/tickets/{tid}/no-show", headers=auth["headers"])
    assert r.status_code == 400


async def test_call_next_requires_open_queue(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"], open_now=False)
    r = await client.post(f"/api/queues/{qid}/call-next", headers=auth["headers"])
    assert r.status_code == 400


async def test_call_next_returns_null_when_empty(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])
    r = await client.post(f"/api/queues/{qid}/call-next", headers=auth["headers"])
    assert r.status_code == 200 and r.json() is None


# --- walk-in -------------------------------------------------------------


async def test_walkin_uses_walk_in_source(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])
    r = await client.post(
        f"/api/queues/{qid}/add-walkin",
        json={"customer_name": "Walkin"},
        headers=auth["headers"],
    )
    assert r.status_code == 201
    body = r.json()
    assert body["source"] == "walk_in"
    # Owner endpoint includes PII (this is intentional — only public reads strip).
    assert body["customer_name"] == "Walkin"


async def test_walkin_requires_owner(client: AsyncClient) -> None:
    a = await register(client, phone="+15550111")
    b = await register(client, phone="+15550222")
    qid = await make_queue(client, a["headers"])

    r = await client.post(
        f"/api/queues/{qid}/add-walkin", json={}, headers=b["headers"]
    )
    assert r.status_code == 403


async def test_call_next_fifo_across_app_and_walkin(client: AsyncClient) -> None:
    auth = await register(client)
    qid = await make_queue(client, auth["headers"])

    app_tid = (await client.post(f"/api/queues/{qid}/join", json={})).json()["id"]
    walkin_tid = (
        await client.post(
            f"/api/queues/{qid}/add-walkin", json={}, headers=auth["headers"]
        )
    ).json()["id"]

    # FIFO by ticket_number — app ticket joined first.
    first = (await client.post(f"/api/queues/{qid}/call-next", headers=auth["headers"])).json()
    assert first["id"] == app_tid
    second = (
        await client.post(f"/api/queues/{qid}/call-next", headers=auth["headers"])
    ).json()
    assert second["id"] == walkin_tid


# --- ownership 403 on every owner-only ticket endpoint ------------------


async def test_owner_only_ticket_endpoints_403(client: AsyncClient) -> None:
    a = await register(client, phone="+15550111")
    b = await register(client, phone="+15550222")
    qid = await make_queue(client, a["headers"])
    tid = (await client.post(f"/api/queues/{qid}/join", json={})).json()["id"]

    for path in (
        f"/api/queues/{qid}/call-next",
        f"/api/queues/{qid}/add-walkin",
        f"/api/tickets/{tid}/complete",
        f"/api/tickets/{tid}/no-show",
    ):
        r = await client.post(path, json={}, headers=b["headers"])
        assert r.status_code == 403, f"{path} returned {r.status_code}"


async def test_get_unknown_ticket_404(client: AsyncClient) -> None:
    r = await client.get("/api/tickets/9999")
    assert r.status_code == 404
