import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.business import BusinessType
from app.models.queue import QueueStatus
from app.models.ticket import TicketSource, TicketStatus


# E.164: leading +, country code 1-9, 6-14 more digits.
# Rejecting non-E.164 phones up front avoids passing junk like "abc" or
# "<script>" downstream to provider APIs and to logs.
_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def _validate_phone(value: str) -> str:
    if not _E164_RE.match(value):
        raise ValueError("phone must be in E.164 format, e.g. +15550100")
    return value


class BusinessRegister(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=4, max_length=32)
    password: str = Field(min_length=6, max_length=100)
    business_type: BusinessType = BusinessType.other
    address: str | None = None
    city: str | None = None
    country: str | None = None

    @field_validator("phone")
    @classmethod
    def _phone_e164(cls, v: str) -> str:
        return _validate_phone(v)


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


class WsTicketOut(BaseModel):
    """Short-lived ticket exchanged for a WS upgrade.

    Carries no PII and is single-use within ~60s, so the URL containing it
    is safe to log in the proxy access log.
    """

    ws_token: str
    expires_in: int


class QueueCreate(BaseModel):
    # auto_open_time / auto_close_time are intentionally absent — there's
    # no scheduler to act on them. Leaving them in the API was a broken
    # contract.
    name: str = Field(min_length=1, max_length=200)
    max_capacity: int | None = Field(default=None, ge=1)
    close_on_max_reached: bool = False


class QueueUpdate(BaseModel):
    # max_capacity matches QueueCreate (ge=1). 0 would mean "queue is always
    # full" — a degenerate state that's almost certainly not what an owner
    # wants. Set to None to clear the cap.
    name: str | None = Field(default=None, min_length=1, max_length=200)
    max_capacity: int | None = Field(default=None, ge=1)
    close_on_max_reached: bool | None = None


class QueueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    name: str
    status: QueueStatus
    max_capacity: int | None
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

    @field_validator("customer_phone")
    @classmethod
    def _phone_e164_optional(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return _validate_phone(v)


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
