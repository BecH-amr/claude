from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_business
from app.limiter import limiter
from app.models import Business, Queue, Ticket, TicketSource
from app.schemas import (
    JoinRequest,
    TicketOut,
    TicketPublicOut,
    TicketStatusOut,
)
from app.services import queue_service

router = APIRouter(tags=["tickets"])
_settings = get_settings()


def _ensure_owner_of_queue(queue: Queue, business: Business) -> None:
    if queue.business_id != business.id:
        raise HTTPException(status_code=403, detail="Not your queue")


async def _get_ticket_or_404(db: AsyncSession, ticket_id: int) -> Ticket:
    ticket = await db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.post("/api/queues/{queue_id}/join", response_model=TicketPublicOut, status_code=201)
@limiter.limit(_settings.rate_limit_join)
async def join(
    request: Request,  # noqa: ARG001 — slowapi reads request.client.host
    queue_id: int,
    payload: JoinRequest,
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    queue = await queue_service.get_queue_or_404(db, queue_id)
    return await queue_service.join_queue(
        db, queue, payload.customer_name, payload.customer_phone, source=TicketSource.app
    )


@router.get("/api/tickets/{ticket_id}", response_model=TicketStatusOut)
async def get_ticket_status(ticket_id: int, db: AsyncSession = Depends(get_db)) -> TicketStatusOut:
    ticket = await _get_ticket_or_404(db, ticket_id)
    queue = await queue_service.get_queue_or_404(db, ticket.queue_id)
    waiting = await queue_service.waiting_count(db, queue.id)
    return TicketStatusOut(
        ticket=TicketPublicOut.model_validate(ticket),
        position=queue_service.position_for(ticket, queue),
        waiting_count=waiting,
        now_serving=queue.now_serving,
        queue_status=queue.status,
    )


@router.get("/api/queues/{queue_id}/tickets", response_model=list[TicketOut])
async def list_active(
    queue_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> list[Ticket]:
    """Owner-only: tickets currently in the working set (waiting + called +
    serving). Used by the dashboard to repopulate the list on reload so
    a refresh doesn't lose the called user."""
    queue = await queue_service.get_queue_or_404(db, queue_id)
    _ensure_owner_of_queue(queue, business)
    return await queue_service.list_active_tickets(db, queue_id)


@router.post("/api/queues/{queue_id}/call-next", response_model=TicketOut | None)
async def call_next(
    queue_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Ticket | None:
    queue = await queue_service.get_queue_or_404(db, queue_id)
    _ensure_owner_of_queue(queue, business)
    return await queue_service.call_next(db, queue)


@router.post("/api/tickets/{ticket_id}/complete", response_model=TicketOut)
async def complete(
    ticket_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    ticket = await _get_ticket_or_404(db, ticket_id)
    queue = await queue_service.get_queue_or_404(db, ticket.queue_id)
    _ensure_owner_of_queue(queue, business)
    return await queue_service.complete_ticket(db, ticket)


@router.post("/api/tickets/{ticket_id}/no-show", response_model=TicketOut)
async def no_show(
    ticket_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    ticket = await _get_ticket_or_404(db, ticket_id)
    queue = await queue_service.get_queue_or_404(db, ticket.queue_id)
    _ensure_owner_of_queue(queue, business)
    return await queue_service.no_show_ticket(db, ticket)


@router.post("/api/queues/{queue_id}/add-walkin", response_model=TicketOut, status_code=201)
async def add_walkin(
    queue_id: int,
    payload: JoinRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Ticket:
    queue = await queue_service.get_queue_or_404(db, queue_id)
    _ensure_owner_of_queue(queue, business)
    return await queue_service.join_queue(
        db, queue, payload.customer_name, payload.customer_phone, source=TicketSource.walk_in
    )
