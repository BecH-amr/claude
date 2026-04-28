from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

# Import the module (not just SessionLocal) so test fixtures that rebind
# `app.db.SessionLocal` are honored — direct `from app.db import SessionLocal`
# captures a stale reference at import time.
from app import db as app_db
from app.models import Queue
from app.security import decode_ws_ticket
from app.services.ws_manager import manager

router = APIRouter(prefix="/api/ws", tags=["ws"])


async def _queue_owner(queue_id: int) -> tuple[bool, int | None]:
    """Returns (exists, business_id). Opens a transient session and releases
    it before returning, so we don't hold a pooled connection for the
    lifetime of the WebSocket."""
    async with app_db.SessionLocal() as db:
        queue = await db.get(Queue, queue_id)
        if queue is None:
            return False, None
        return True, queue.business_id


@router.websocket("/queue/{queue_id}")
async def queue_socket(websocket: WebSocket, queue_id: int) -> None:
    """Public real-time channel for customers — broadcasts position changes,
    'you're being called', and queue state transitions for the given queue."""
    exists, _ = await _queue_owner(queue_id)
    if not exists:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Queue not found")
        return
    await manager.connect_queue(queue_id, websocket)
    try:
        while True:
            # No inbound messages expected; consume to detect disconnects.
            # RuntimeError catches abnormal close paths where the transport
            # tears down before Starlette frames the disconnect message.
            await websocket.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await manager.disconnect_queue(queue_id, websocket)


@router.websocket("/dashboard/{queue_id}")
async def dashboard_socket(
    websocket: WebSocket,
    queue_id: int,
    token: str | None = Query(default=None),
) -> None:
    """Owner-authenticated dashboard channel.

    Auth is via a short-lived single-use ticket (audience='ws', TTL ~60s)
    obtained from POST /api/queues/{id}/ws-ticket. We deliberately don't
    accept the long-lived session bearer here: the token lands in proxy
    access logs, and a 60s window of exposure for a queue-scoped credential
    is acceptable while a 7-day session bearer is not.
    """
    business_id = decode_ws_ticket(token, queue_id) if token else None
    if business_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return

    exists, owner_id = await _queue_owner(queue_id)
    if not exists:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Queue not found")
        return
    if owner_id != business_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not your queue")
        return

    await manager.connect_dashboard(queue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await manager.disconnect_dashboard(queue_id, websocket)
