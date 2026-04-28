import io

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_business
from app.models import Business, Queue, QueueStatus, Ticket, TicketStatus
from app.schemas import QueueCreate, QueueOut, QueuePublic, QueueUpdate

router = APIRouter(prefix="/api/queues", tags=["queues"])
settings = get_settings()


async def _get_queue_or_404(db: AsyncSession, queue_id: int) -> Queue:
    queue = await db.get(Queue, queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return queue


def _ensure_owner(queue: Queue, business: Business) -> None:
    if queue.business_id != business.id:
        raise HTTPException(status_code=403, detail="Not your queue")


async def _waiting_count(db: AsyncSession, queue_id: int) -> int:
    result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.queue_id == queue_id, Ticket.status == TicketStatus.waiting
        )
    )
    return int(result.scalar_one() or 0)


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
        auto_open_time=payload.auto_open_time,
        auto_close_time=payload.auto_close_time,
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
    queue = await _get_queue_or_404(db, queue_id)
    waiting = await _waiting_count(db, queue.id)
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
    queue = await _get_queue_or_404(db, queue_id)
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
    queue = await _get_queue_or_404(db, queue_id)
    _ensure_owner(queue, business)
    queue.status = QueueStatus.open
    await db.commit()
    await db.refresh(queue)
    return queue


@router.post("/{queue_id}/close", response_model=QueueOut)
async def close_queue(
    queue_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Queue:
    queue = await _get_queue_or_404(db, queue_id)
    _ensure_owner(queue, business)
    queue.status = QueueStatus.closed
    await db.commit()
    await db.refresh(queue)
    return queue


@router.get("/{queue_id}/qr")
async def queue_qr(queue_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    queue = await _get_queue_or_404(db, queue_id)
    join_url = f"{settings.public_base_url.rstrip('/')}/q/{queue.id}"
    img = qrcode.make(join_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
