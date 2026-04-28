from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.db import SessionLocal
from app.models import Queue
from app.security import decode_token
from app.services.ws_manager import manager

router = APIRouter(prefix="/api/ws", tags=["ws"])


async def _queue_owner(queue_id: int) -> tuple[bool, int | None]:
    """Returns (exists, business_id). Opens a transient session and releases
    it before returning, so we don't hold a pooled connection for the
    lifetime of the WebSocket."""
    async with SessionLocal() as db:
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
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect_queue(queue_id, websocket)


@router.websocket("/dashboard/{queue_id}")
async def dashboard_socket(
    websocket: WebSocket,
    queue_id: int,
    token: str | None = Query(default=None),
) -> None:
    """Owner-authenticated channel for the business dashboard. Auth is via a
    `?token=` query param because browsers can't set Authorization headers
    on WebSocket connections."""
    business_id = decode_token(token) if token else None
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
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect_dashboard(queue_id, websocket)
