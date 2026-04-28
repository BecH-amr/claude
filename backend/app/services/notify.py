import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# Reused across calls so connection pooling actually happens. The 10s timeout
# matches the per-call budget — if a provider stalls we still want to fall
# back to the next one within a reasonable window.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Lazy module-level client. Creating it lazily means tests that patch
    httpx.AsyncClient still see their patch take effect on first use."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10)
    return _client


async def aclose_clients() -> None:
    """Hook for the FastAPI shutdown event so we don't leak sockets."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _send_whatsapp(phone: str, message: str) -> bool:
    s = get_settings()
    if not (s.whatsapp_api_url and s.whatsapp_api_token and s.whatsapp_phone_id):
        return False
    url = f"{s.whatsapp_api_url.rstrip('/')}/{s.whatsapp_phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {s.whatsapp_api_token}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message},
    }
    try:
        resp = await _get_client().post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        logger.warning("WhatsApp send failed: %s", exc)
        return False


async def _send_sms(phone: str, message: str) -> bool:
    s = get_settings()
    if not (s.sms_api_url and s.sms_api_token):
        return False
    headers = {"Authorization": f"Bearer {s.sms_api_token}"}
    payload = {"to": phone, "message": message}
    try:
        resp = await _get_client().post(s.sms_api_url, json=payload, headers=headers)
        resp.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        logger.warning("SMS send failed: %s", exc)
        return False


async def send_notification(phone: str | None, message: str) -> bool:
    """Try WhatsApp first, then SMS. Returns True if any provider accepted the message.

    When neither is configured, log the intent and return False so callers can
    treat notification as best-effort without crashing the request flow.
    """
    if not phone:
        return False
    if await _send_whatsapp(phone, message):
        return True
    if await _send_sms(phone, message):
        return True
    logger.info("[notify-stub] phone=%s msg=%s", phone, message)
    return False
