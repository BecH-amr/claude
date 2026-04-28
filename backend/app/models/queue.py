import enum
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class QueueStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    paused = "paused"


class Queue(Base):
    __tablename__ = "queues"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[QueueStatus] = mapped_column(
        Enum(QueueStatus, name="queue_status"),
        default=QueueStatus.closed,
        nullable=False,
    )
    max_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_open_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    auto_close_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    close_on_max_reached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    current_ticket_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    now_serving: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    business: Mapped["Business"] = relationship(back_populates="queues", lazy="selectin")  # noqa: F821
    tickets: Mapped[list["Ticket"]] = relationship(  # noqa: F821
        back_populates="queue", cascade="all, delete-orphan", lazy="raise"
    )
