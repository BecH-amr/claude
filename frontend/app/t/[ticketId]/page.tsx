"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useQueueSocket } from "@/hooks/useQueueSocket";
import type { TicketStatusResponse } from "@/lib/types";

const callOutCopy: Record<string, { headline: string; sub: string }> = {
  waiting: { headline: "You're in line.", sub: "We'll keep this page in sync." },
  called: { headline: "It's your turn.", sub: "Please come now." },
  serving: { headline: "You're being served.", sub: "" },
  completed: { headline: "All done.", sub: "Thanks for using Q." },
  no_show: { headline: "We missed you.", sub: "Tap join again to retake your spot." },
  cancelled: { headline: "Cancelled.", sub: "" },
};

export default function StatusPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params.ticketId;

  const [data, setData] = useState<TicketStatusResponse | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the latest in-flight fetch so older responses don't overwrite newer ones.
  const reqIdRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    const myId = ++reqIdRef.current;
    try {
      const s = await api.getTicketStatus(ticketId);
      if (myId === reqIdRef.current) {
        setData(s);
        setError(null);
      }
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      if (e instanceof ApiError) {
        setErrorStatus(e.status);
        setError(e.message);
      } else {
        setErrorStatus(null);
        setError("Could not load ticket");
      }
    }
  }, [ticketId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Re-fetch on every queue event so position recomputes from server.
  const { event, status: wsStatus } = useQueueSocket(data?.ticket.queue_id ?? null);
  useEffect(() => {
    if (event) fetchStatus();
  }, [event, fetchStatus]);

  if (error) {
    const isMissing = errorStatus === 404;
    return (
      <div className="flex flex-col h-full justify-center text-center gap-3">
        <h1 className="text-3xl">{isMissing ? "Ticket not found" : "Couldn't load ticket"}</h1>
        <p className="text-ink-muted">{error}</p>
        {!isMissing && (
          <button
            type="button"
            className="btn-ghost mx-auto mt-2"
            onClick={() => location.reload()}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col h-full justify-center text-center text-ink-subtle">
        Loading…
      </div>
    );
  }

  const { ticket, position, waiting_count, now_serving } = data;
  const copy = callOutCopy[ticket.status] ?? callOutCopy.waiting;
  const isHighlighted = ticket.status === "called" || ticket.status === "serving";
  const accent = isHighlighted ? "bg-coral text-cream" : "bg-cream-raised text-ink";
  const wsText =
    wsStatus === "open"
      ? "connected"
      : wsStatus === "reconnecting"
      ? "reconnecting…"
      : wsStatus;

  return (
    <div className="flex flex-col h-full gap-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-widest text-ink-subtle mb-2">
          Ticket #{ticket.ticket_number}
        </p>
        <h1 className="text-3xl font-serif tracking-tightest">{copy.headline}</h1>
        {copy.sub && <p className="mt-2 text-ink-muted">{copy.sub}</p>}
      </header>

      <section
        aria-live="polite"
        className={`rounded-2xl border border-line p-8 text-center shadow-card ${accent}`}
      >
        <p
          className={`text-xs uppercase tracking-widest mb-2 ${
            isHighlighted ? "text-cream/90" : "text-ink-subtle"
          }`}
        >
          {ticket.status === "waiting" ? "Position" : "Status"}
        </p>
        <p className="text-7xl font-serif tracking-tightest leading-none">
          {ticket.status === "waiting" ? (position ?? "—") : ticket.status.replace("_", " ")}
        </p>
        {ticket.status === "waiting" && (
          <p className={`mt-4 text-sm ${isHighlighted ? "" : "text-ink-muted"}`}>
            {waiting_count} {waiting_count === 1 ? "person" : "people"} waiting · now serving{" "}
            {now_serving ?? "—"}
          </p>
        )}
      </section>

      <p className="text-center text-xs text-ink-subtle">Live · {wsText}</p>

      <footer className="mt-auto pt-6 text-center text-xs text-ink-subtle">
        Keep this tab open to stay in sync.
      </footer>
    </div>
  );
}
