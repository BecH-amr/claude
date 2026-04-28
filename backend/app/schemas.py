from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, Field

from app.models.business import BusinessType
from app.models.queue import QueueStatus
from app.models.ticket import TicketSource, TicketStatus


class BusinessRegister(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=4, max_length=32)
    password: str = Field(min_length=6, max_length=100)
    business_type: BusinessType = BusinessType.other
    address: str | None = None
    city: str | None = None
    country: str | None = None


class BusinessLogin(BaseModel):
    phone: str
    password: str


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    business_type: BusinessType
    address: str | None
    city: str | None
    country: str | None
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    business: BusinessOut


class QueueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    max_capacity: int | None = Field(default=None, ge=1)
    auto_open_time: time | None = None
    auto_close_time: time | None = None
    close_on_max_reached: bool = False


class QueueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    max_capacity: int | None = Field(default=None, ge=0)
    auto_open_time: time | None = None
    auto_close_time: time | None = None
    close_on_max_reached: bool | None = None


class QueueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    name: str
    status: QueueStatus
    max_capacity: int | None
    auto_open_time: time | None
    auto_close_time: time | None
    close_on_max_reached: bool
    current_ticket_number: int
    now_serving: int | None
    created_at: datetime


class QueuePublic(BaseModel):
    id: int
    name: str
    status: QueueStatus
    business_name: str
    waiting_count: int
    now_serving: int | None
    max_capacity: int | None


class JoinRequest(BaseModel):
    customer_name: str | None = Field(default=None, max_length=200)
    customer_phone: str | None = Field(default=None, max_length=32)


class WalkInRequest(BaseModel):
    customer_name: str | None = Field(default=None, max_length=200)
    customer_phone: str | None = Field(default=None, max_length=32)


class TicketOut(BaseModel):
    """Owner-only view including PII. Use TicketPublicOut for customer/public reads."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    queue_id: int
    ticket_number: int
    customer_name: str | None
    customer_phone: str | None
    source: TicketSource
    status: TicketStatus
    joined_at: datetime
    called_at: datetime | None
    completed_at: datetime | None


class TicketPublicOut(BaseModel):
    """Customer-facing ticket view. Strips PII (name/phone) so guessable
    integer ticket IDs cannot be used to enumerate other customers' contact info."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    queue_id: int
    ticket_number: int
    source: TicketSource
    status: TicketStatus
    joined_at: datetime
    called_at: datetime | None
    completed_at: datetime | None


class TicketStatusOut(BaseModel):
    ticket: TicketPublicOut
    position: int | None
    waiting_count: int
    now_serving: int | None
    queue_status: QueueStatus
