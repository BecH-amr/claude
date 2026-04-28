"use client";

import { useEffect, useRef, useState } from "react";
import type { QueueWsEvent } from "@/lib/types";

type Status = "connecting" | "open" | "reconnecting" | "closed";

function wsUrlFor(path: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

/**
 * Owner-authenticated dashboard channel. Token passed as `?token=` because
 * browsers can't set Authorization headers on WebSocket upgrades.
 *
 * Mirrors the public hook's correctness pattern (timer in ref, per-socket
 * stale-close guard) and additionally halts reconnects on ANY 1008 close
 * (policy violation = unauthorized / not-your-queue / queue-not-found),
 * even after a previously successful open. That last bit prevents an
 * infinite reconnect storm after the backend revokes a token mid-session.
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

    const safePath =
      `/api/ws/dashboard/${encodeURIComponent(String(queueId))}` +
      `?token=${encodeURIComponent(token)}`;

    const connect = () => {
      if (cancelledRef.current) return;
      setStatus(retryRef.current === 0 ? "connecting" : "reconnecting");
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
        // Halt on 1008 (policy violation) — token revoked, queue gone, or
        // ownership changed. Retrying just spams the backend.
        if (ev.code === 1008) {
          setStatus("closed");
          return;
        }
        const ceiling = Math.min(30_000, 500 * 2 ** retryRef.current);
        const backoff = Math.floor(ceiling * (0.5 + Math.random() * 0.5));
        retryRef.current += 1;
        setStatus("reconnecting");
        timerRef.current = setTimeout(connect, backoff);
      });
    };

    connect();

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
