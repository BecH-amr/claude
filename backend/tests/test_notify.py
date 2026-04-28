"""Tests for app.services.notify — the WhatsApp-first / SMS-fallback chain."""

from typing import Any

import httpx
import pytest

from app.services import notify


def _patch_settings(monkeypatch, **values: Any) -> None:
    """Override get_settings() to return a stub with the given attrs.

    notify reads settings *inside* each helper, not at import-time, so this
    works without restarting the module.
    """
    real = notify.get_settings()
    overrides = {**real.model_dump(), **values}
    Stub = type("Stub", (), overrides)
    monkeypatch.setattr(notify, "get_settings", lambda: Stub())


async def test_send_notification_no_phone_returns_false() -> None:
    assert await notify.send_notification(None, "msg") is False
    assert await notify.send_notification("", "msg") is False


async def test_send_notification_no_provider_logs_and_returns_false(
    monkeypatch, caplog
) -> None:
    """Without WhatsApp + SMS configured, notify falls back to a log line."""
    _patch_settings(
        monkeypatch,
        whatsapp_api_url=None,
        whatsapp_api_token=None,
        whatsapp_phone_id=None,
        sms_api_url=None,
        sms_api_token=None,
    )
    import logging

    with caplog.at_level(logging.INFO, logger="app.services.notify"):
        ok = await notify.send_notification("+15550100", "your turn")
    assert ok is False
    assert any("notify-stub" in r.getMessage() for r in caplog.records)


async def test_whatsapp_success_short_circuits(monkeypatch) -> None:
    """When WhatsApp succeeds, SMS is never called."""
    _patch_settings(
        monkeypatch,
        whatsapp_api_url="https://wa.example.com/v1",
        whatsapp_api_token="wat",
        whatsapp_phone_id="42",
        sms_api_url="https://sms.example.com/send",
        sms_api_token="smt",
    )

    sms_called = {"hit": False}

    def handler(request: httpx.Request) -> httpx.Response:
        if "wa.example.com" in str(request.url):
            return httpx.Response(200, json={"ok": True})
        sms_called["hit"] = True
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def fake_client(*args, **kwargs):
        return real_client(transport=transport, timeout=kwargs.get("timeout", 10))

    monkeypatch.setattr(notify.httpx, "AsyncClient", fake_client)

    ok = await notify.send_notification("+15550100", "your turn")
    assert ok is True
    assert sms_called["hit"] is False


async def test_sms_fallback_on_whatsapp_http_error(monkeypatch) -> None:
    _patch_settings(
        monkeypatch,
        whatsapp_api_url="https://wa.example.com/v1",
        whatsapp_api_token="wat",
        whatsapp_phone_id="42",
        sms_api_url="https://sms.example.com/send",
        sms_api_token="smt",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if "wa.example.com" in str(request.url):
            return httpx.Response(500, json={"error": "down"})
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def fake_client(*args, **kwargs):
        return real_client(transport=transport, timeout=kwargs.get("timeout", 10))

    monkeypatch.setattr(notify.httpx, "AsyncClient", fake_client)

    ok = await notify.send_notification("+15550100", "your turn")
    assert ok is True


async def test_whatsapp_payload_shape(monkeypatch) -> None:
    """Verify we send the WhatsApp Business API JSON shape, not something else."""
    _patch_settings(
        monkeypatch,
        whatsapp_api_url="https://wa.example.com/v1",
        whatsapp_api_token="wat",
        whatsapp_phone_id="42",
        sms_api_url=None,
        sms_api_token=None,
    )

    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["json"] = request.read().decode()
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def fake_client(*args, **kwargs):
        return real_client(transport=transport, timeout=kwargs.get("timeout", 10))

    monkeypatch.setattr(notify.httpx, "AsyncClient", fake_client)

    ok = await notify.send_notification("+15550100", "your turn")
    assert ok is True
    assert captured["url"] == "https://wa.example.com/v1/42/messages"
    assert captured["headers"]["authorization"] == "Bearer wat"
    import json as _j

    body = _j.loads(captured["json"])
    assert body["messaging_product"] == "whatsapp"
    assert body["to"] == "+15550100"
    assert body["type"] == "text"
    assert body["text"]["body"] == "your turn"


async def test_both_providers_fail_returns_false(monkeypatch) -> None:
    _patch_settings(
        monkeypatch,
        whatsapp_api_url="https://wa.example.com/v1",
        whatsapp_api_token="wat",
        whatsapp_phone_id="42",
        sms_api_url="https://sms.example.com/send",
        sms_api_token="smt",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "down"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def fake_client(*args, **kwargs):
        return real_client(transport=transport, timeout=kwargs.get("timeout", 10))

    monkeypatch.setattr(notify.httpx, "AsyncClient", fake_client)

    ok = await notify.send_notification("+15550100", "your turn")
    assert ok is False
