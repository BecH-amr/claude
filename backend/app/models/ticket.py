import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TicketSource(str, enum.Enum):
    app = "app"
    walk_in = "walk_in"


class TicketStatus(str, enum.Enum):
    waiting = "waiting"
    called = "called"
    serving = "serving"
    completed = "completed"
    no_show = "no_show"
    cancelled = "cancelled"


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    queue_id: Mapped[int] = mapped_column(
        ForeignKey("queues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ticket_number: Mapped[int] = mapped_column(Integer, nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source: Mapped[TicketSource] = mapped_column(
        Enum(TicketSource, name="ticket_source"),
        default=TicketSource.app,
        nullable=False,
    )
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticket_status"),
        default=TicketStatus.waiting,
        nullable=False,
        index=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    queue: Mapped["Queue"] = relationship(back_populates="tickets", lazy="selectin")  # noqa: F821
