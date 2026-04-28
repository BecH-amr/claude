import logging
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt as pyjwt

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# bcrypt accepts at most 72 bytes — silently truncate to match its native behavior.
_BCRYPT_MAX = 72

# Distinguishes the short-lived WebSocket ticket from a regular session token,
# so a leaked WS-ticket can't be reused as a session bearer and vice versa.
_ACCESS_AUD = "session"
_WS_AUD = "ws"


def _b(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_b(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_b(password), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(business_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(business_id), "exp": expire, "aud": _ACCESS_AUD}
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_ws_ticket(business_id: int, queue_id: int, ttl_seconds: int = 60) -> str:
    """Short-lived single-purpose ticket exchanged for a WS connection.

    Bound to a specific queue so a leaked ticket can't pivot to another
    queue's dashboard. TTL is intentionally short — the REST→WS handshake
    completes in <1s; 60s tolerates clock skew.
    """
    expire = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    payload = {
        "sub": str(business_id),
        "queue_id": queue_id,
        "exp": expire,
        "aud": _WS_AUD,
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> int | None:
    """Decode a session bearer token and return the business id, or None."""
    try:
        payload = pyjwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=_ACCESS_AUD,
            options={"require": ["exp", "sub"]},
        )
    except pyjwt.PyJWTError as exc:
        logger.debug("session token decode failed: %s", type(exc).__name__)
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    try:
        return int(sub)
    except (TypeError, ValueError):
        logger.debug("session token sub is not an int")
        return None


def decode_ws_ticket(token: str, queue_id: int) -> int | None:
    """Validate a WS ticket and confirm it was issued for this queue."""
    try:
        payload = pyjwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=_WS_AUD,
            options={"require": ["exp", "sub", "queue_id"]},
        )
    except pyjwt.PyJWTError as exc:
        logger.debug("ws ticket decode failed: %s", type(exc).__name__)
        return None
    if payload.get("queue_id") != queue_id:
        return None
    sub = payload.get("sub")
    try:
        return int(sub) if sub is not None else None
    except (TypeError, ValueError):
        return None
