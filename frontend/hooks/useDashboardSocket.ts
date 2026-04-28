"use client";

import { useEffect, useRef, useState } from "react";
import type { QueueWsEvent } from "@/lib/types";

type Status = "connecting" | "open" | "closed";

function wsUrlFor(path: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

/**
 * Owner-authenticated dashboard channel. Token is passed as `?token=` because
 * browsers can't set Authorization headers on WebSocket upgrades.
 *
 * Avoids reconnect storms when the token is rejected: a 1008 close with no
 * prior `open` halts retries.
 */
export function useDashboardSocket(queueId: number | null, token: string | null) {
  const [event, setEvent] = useState<QueueWsEvent | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const everOpened = useRef(false);
  const closedByUs = useRef(false);

  useEffect(() => {
    if (queueId === null || !token) return;
    closedByUs.current = false;
    everOpened.current = false;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("connecting");
      const ws = new WebSocket(
        wsUrlFor(`/api/ws/dashboard/${queueId}?token=${encodeURIComponent(token)}`),
      );
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        everOpened.current = true;
        setStatus("open");
      };
      ws.onmessage = (e) => {
        try {
          setEvent(JSON.parse(e.data) as QueueWsEvent);
        } catch {
          // ignore malformed
        }
      };
      ws.onclose = (ev) => {
        setStatus("closed");
        if (closedByUs.current) return;
        // 1008 = policy violation. If we never even opened, the token was
        // rejected — don't retry.
        if (ev.code === 1008 && !everOpened.current) return;
        const backoff = Math.min(30_000, 500 * 2 ** retryRef.current);
        retryRef.current += 1;
        cancelTimer = setTimeout(connect, backoff);
      };
      ws.onerror = () => {
        // onclose follows
      };
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (cancelTimer) clearTimeout(cancelTimer);
      wsRef.current?.close();
    };
  }, [queueId, token]);

  return { event, status };
}
