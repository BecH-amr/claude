"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { QueueWsEvent } from "@/lib/types";

type Status = "connecting" | "open" | "reconnecting" | "closed";

function wsUrlFor(path: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

/**
 * Owner-authenticated dashboard channel.
 *
 * Auth flow: REST → POST /api/queues/{id}/ws-ticket (with the session
 * bearer) → 60s queue-scoped ticket → WS upgrade with ?token=<ticket>.
 * The session bearer never enters the URL, so it never lands in proxy
 * access logs. On reconnect we mint a fresh ticket because the previous
 * one may have expired during the backoff window.
 *
 * The `token` parameter still gates the hook (no token = signed out),
 * but is no longer interpolated into the URL.
 */
export function useDashboardSocket(queueId: number | null, token: string | null) {
  const [event, setEvent] = useState<QueueWsEvent | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (queueId === null || !token) return;
    cancelledRef.current = false;
    retryRef.current = 0;

    const connect = async () => {
      if (cancelledRef.current) return;
      setStatus(retryRef.current === 0 ? "connecting" : "reconnecting");

      let ticket: string;
      try {
        const res = await api.getWsTicket(queueId);
        ticket = res.ws_token;
      } catch {
        // Couldn't mint a ticket (token expired, network out, etc.).
        // Treat as a soft close so the existing backoff fires.
        if (cancelledRef.current) return;
        const ceiling = Math.min(30_000, 500 * 2 ** retryRef.current);
        const backoff = Math.floor(ceiling * (0.5 + Math.random() * 0.5));
        retryRef.current += 1;
        setStatus("reconnecting");
        timerRef.current = setTimeout(() => {
          void connect();
        }, backoff);
        return;
      }
      if (cancelledRef.current) return;

      const safePath =
        `/api/ws/dashboard/${encodeURIComponent(String(queueId))}` +
        `?token=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(wsUrlFor(safePath));
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (cancelledRef.current) {
          ws.close(1000);
          return;
        }
        retryRef.current = 0;
        setStatus("open");
      });

      ws.addEventListener("message", (e) => {
        if (cancelledRef.current) return;
        try {
          setEvent(JSON.parse(e.data) as QueueWsEvent);
        } catch {
          // ignore malformed
        }
      });

      ws.addEventListener("close", (ev) => {
        // Stale-socket guard: if a newer effect run already replaced wsRef,
        // ignore this old close so it doesn't schedule a stray reconnect.
        if (ws !== wsRef.current) return;
        if (cancelledRef.current) {
          setStatus("closed");
          return;
        }
        // Halt on 1008 (policy violation) — ticket rejected, queue gone,
        // or ownership changed. Retrying just spams the backend.
        if (ev.code === 1008) {
          setStatus("closed");
          return;
        }
        const ceiling = Math.min(30_000, 500 * 2 ** retryRef.current);
        const backoff = Math.floor(ceiling * (0.5 + Math.random() * 0.5));
        retryRef.current += 1;
        setStatus("reconnecting");
        timerRef.current = setTimeout(() => {
          void connect();
        }, backoff);
      });
    };

    void connect();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      wsRef.current?.close(1000);
      wsRef.current = null;
    };
  }, [queueId, token]);

  return { event, status };
}
