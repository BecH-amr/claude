import asyncio
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Queue, QueueStatus, Ticket, TicketSource, TicketStatus
from app.services import notify
from app.services.ws_manager import manager

logger = logging.getLogger(__name__)

# Statuses a ticket can validly transition out of via owner actions
_FINISHABLE = {TicketStatus.called, TicketStatus.serving, TicketStatus.waiting}


async def waiting_count(db: AsyncSession, queue_id: int) -> int:
    result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.queue_id == queue_id, Ticket.status == TicketStatus.waiting
        )
    )
    return int(result.scalar_one() or 0)


def position_for(ticket: Ticket, queue: Queue) -> int | None:
    """1-based position of a still-waiting ticket within the line.

    Returns None if the ticket is no longer waiting OR if the queue has
    already advanced past this ticket's number (e.g. it was passed over).
    The previous behaviour clamped to 1, which surfaced a confusing
    "you're next" forever to a passed-over customer.
    """
    if ticket.status != TicketStatus.waiting:
        return None
    base = queue.now_serving or 0
    if ticket.ticket_number <= base:
        return None
    return ticket.ticket_number - base


async def get_queue_or_404(db: AsyncSession, queue_id: int) -> Queue:
    queue = await db.get(Queue, queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return queue


async def join_queue(
    db: AsyncSession,
    queue: Queue,
    customer_name: str | None,
    customer_phone: str | None,
    source: TicketSource = TicketSource.app,
) -> Ticket:
    if queue.status != QueueStatus.open:
        raise HTTPException(status_code=400, detail="Queue is not open")

    waiting = await waiting_count(db, queue.id)
    if queue.max_capacity is not None and waiting >= queue.max_capacity:
        raise HTTPException(status_code=400, detail="Queue is full")

    queue.current_ticket_number += 1
    ticket = Ticket(
        queue_id=queue.id,
        ticket_number=queue.current_ticket_number,
        customer_name=customer_name,
        customer_phone=customer_phone,
        source=source,
        status=TicketStatus.waiting,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    await db.refresh(queue)

    # We just added one; recompute incrementally instead of a second SELECT.
    waiting_after = waiting + 1

    # Auto-close if max reached after this join
    if (
        queue.max_capacity is not None
        and queue.close_on_max_reached
        and waiting_after >= queue.max_capacity
    ):
        queue.status = QueueStatus.closed
        await db.commit()
        await db.refresh(queue)

    await broadcast_state(
        queue,
        waiting_after,
        event="ticket.joined",
        extra={"ticket_id": ticket.id, "ticket_number": ticket.ticket_number},
    )
    return ticket


async def call_next(db: AsyncSession, queue: Queue) -> Ticket | None:
    if queue.status != QueueStatus.open:
        raise HTTPException(status_code=400, detail="Queue is not open")

    result = await db.execute(
        select(Ticket)
        .where(Ticket.queue_id == queue.id, Ticket.status == TicketStatus.waiting)
        .order_by(Ticket.ticket_number.asc())
        .limit(1)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        return None

    ticket.status = TicketStatus.called
    ticket.called_at = datetime.now(timezone.utc)
    queue.now_serving = ticket.ticket_number
    await db.commit()
    await db.refresh(ticket)
    await db.refresh(queue)

    # Notify is best-effort and slow (10-20s timeout). Fire-and-forget so we
    # don't block the call-next response or hold the request's DB session.
    if ticket.customer_phone:
        msg = (
            f"It's your turn at {queue.name}. "
            f"Ticket #{ticket.ticket_number}. Please come now."
        )
        asyncio.create_task(_safe_notify(ticket.customer_phone, msg))

    waiting = await waiting_count(db, queue.id)
    await broadcast_state(
        queue,
        waiting,
        event="ticket.called",
        extra={"ticket_id": ticket.id, "ticket_number": ticket.ticket_number},
    )
    return ticket


async def complete_ticket(db: AsyncSession, ticket: Ticket) -> Ticket:
    if ticket.status not in (TicketStatus.called, TicketStatus.serving):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot complete ticket in status '{ticket.status.value}'",
        )
    ticket.status = TicketStatus.completed
    ticket.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket)
    queue = await db.get(Queue, ticket.queue_id)
    if queue:
        waiting = await waiting_count(db, queue.id)
        await broadcast_state(
            queue, waiting, event="ticket.completed", extra={"ticket_id": ticket.id}
        )
    return ticket


async def no_show_ticket(db: AsyncSession, ticket: Ticket) -> Ticket:
    if ticket.status not in (TicketStatus.called, TicketStatus.waiting):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark no-show on ticket in status '{ticket.status.value}'",
        )
    ticket.status = TicketStatus.no_show
    ticket.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket)
    queue = await db.get(Queue, ticket.queue_id)
    if queue:
        waiting = await waiting_count(db, queue.id)
        await broadcast_state(
            queue, waiting, event="ticket.no_show", extra={"ticket_id": ticket.id}
        )
    return ticket


async def broadcast_state(
    queue: Queue, waiting: int, event: str, extra: dict | None = None
) -> None:
    payload: dict = {
        "event": event,
        "queue_id": queue.id,
        "status": queue.status.value,
        "now_serving": queue.now_serving,
        "waiting_count": waiting,
        "current_ticket_number": queue.current_ticket_number,
    }
    if extra:
        payload.update(extra)
    await manager.broadcast_all(queue.id, payload)


async def _safe_notify(phone: str, message: str) -> None:
    try:
        await notify.send_notification(phone, message)
    except Exception as exc:
        logger.warning("notify task failed: %s", exc)
