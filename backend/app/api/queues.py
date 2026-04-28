import io

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_business
from app.models import Business, Queue, QueueStatus
from app.schemas import (
    QueueCreate,
    QueueOut,
    QueuePublic,
    QueueUpdate,
    WsTicketOut,
)
from app.security import create_ws_ticket
from app.services.queue_service import broadcast_state, get_queue_or_404, waiting_count

router = APIRouter(prefix="/api/queues", tags=["queues"])
settings = get_settings()

# WS ticket TTL — short enough that proxy log retention is non-credentialed
# for any practical purpose, long enough to tolerate a slow REST→WS hop.
_WS_TICKET_TTL = 60


def _ensure_owner(queue: Queue, business: Business) -> None:
    if queue.business_id != business.id:
        raise HTTPException(status_code=403, detail="Not your queue")


@router.post("", response_model=QueueOut, status_code=status.HTTP_201_CREATED)
async def create_queue(
    payload: QueueCreate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Queue:
    queue = Queue(
        business_id=business.id,
        name=payload.name,
        max_capacity=payload.max_capacity,
        close_on_max_reached=payload.close_on_max_reached,
        status=QueueStatus.closed,
    )
    db.add(queue)
    await db.commit()
    await db.refresh(queue)
    return queue


@router.get("/mine", response_model=list[QueueOut])
async def list_my_queues(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> list[Queue]:
    result = await db.execute(
        select(Queue).where(Queue.business_id == business.id).order_by(Queue.id.desc())
    )
    return list(result.scalars().all())


@router.get("/{queue_id}", response_model=QueuePublic)
async def get_queue_public(queue_id: int, db: AsyncSession = Depends(get_db)) -> QueuePublic:
    # Only this endpoint actually traverses Queue.business; keep the eager
    # load explicit here instead of forcing selectin on every db.get(Queue).
    result = await db.execute(
        select(Queue).where(Queue.id == queue_id).options(selectinload(Queue.business))
    )
    queue = result.scalar_one_or_none()
    if queue is None:
        raise HTTPException(status_code=404, detail="Queue not found")
    waiting = await waiting_count(db, queue.id)
    return QueuePublic(
        id=queue.id,
        name=queue.name,
        status=queue.status,
        business_name=queue.business.name if queue.business else "",
        waiting_count=waiting,
        now_serving=queue.now_serving,
        max_capacity=queue.max_capacity,
    )


@router.patch("/{queue_id}", response_model=QueueOut)
async def update_queue(
    queue_id: int,
    payload: QueueUpdate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Queue:
    queue = await get_queue_or_404(db, queue_id)
    _ensure_owner(queue, business)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(queue, field, value)
    await db.commit()
    await db.refresh(queue)
    return queue


@router.post("/{queue_id}/open", response_model=QueueOut)
async def open_queue(
    queue_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Queue:
    queue = await get_queue_or_404(db, queue_id)
    _ensure_owner(queue, business)
    queue.status = QueueStatus.open
    await db.commit()
    await db.refresh(queue)
    waiting = await waiting_count(db, queue.id)
    await broadcast_state(queue, waiting, event="queue.opened")
    return queue


@router.post("/{queue_id}/close", response_model=QueueOut)
async def close_queue(
    queue_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Queue:
    queue = await get_queue_or_404(db, queue_id)
    _ensure_owner(queue, business)
    queue.status = QueueStatus.closed
    await db.commit()
    await db.refresh(queue)
    waiting = await waiting_count(db, queue.id)
    await broadcast_state(queue, waiting, event="queue.closed")
    return queue


@router.get("/{queue_id}/qr")
async def queue_qr(queue_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    queue = await get_queue_or_404(db, queue_id)
    join_url = f"{settings.public_base_url.rstrip('/')}/q/{queue.id}"
    img = qrcode.make(join_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.post("/{queue_id}/ws-ticket", response_model=WsTicketOut)
async def issue_ws_ticket(
    queue_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> WsTicketOut:
    """Mint a short-lived WS ticket for a specific queue dashboard.

    The dashboard WebSocket no longer accepts the session bearer in the
    `?token=` query — that bearer survives 7 days and lands in proxy access
    logs. This ticket is queue-scoped, audience-scoped, and expires in 60s.
    """
    queue = await get_queue_or_404(db, queue_id)
    _ensure_owner(queue, business)
    return WsTicketOut(
        ws_token=create_ws_ticket(business.id, queue.id, ttl_seconds=_WS_TICKET_TTL),
        expires_in=_WS_TICKET_TTL,
    )
