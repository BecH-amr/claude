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
 * Subscribe to a queue's public real-time channel.
 *
 * Reconnects with exponential backoff + jitter (cap 30s). Per-instance
 * close-by-us guarding via `wsRef`/`cancelledRef` avoids "ghost" reconnects
 * when an unmount races with a delayed `onclose` from a prior socket.
 */
export function useQueueSocket(queueId: number | string | null) {
  const [event, setEvent] = useState<QueueWsEvent | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (queueId === null || queueId === undefined) return;
    cancelledRef.current = false;
    retryRef.current = 0;

    const safePath = `/api/ws/queue/${encodeURIComponent(String(queueId))}`;

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

      ws.addEventListener("close", () => {
        // If this isn't the active socket anymore, the new effect run owns
        // reconnection state — drop the stale close.
        if (ws !== wsRef.current) return;
        if (cancelledRef.current) {
          setStatus("closed");
          return;
        }
        // Backoff with full jitter to avoid thundering herds.
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
  }, [queueId]);

  return { event, status };
}
