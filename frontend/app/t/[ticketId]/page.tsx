"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useI18n, type StringKey } from "@/lib/i18n";
import { useQueueSocket } from "@/hooks/useQueueSocket";
import type { TicketStatus, TicketStatusResponse } from "@/lib/types";

// Typed as Record<TicketStatus, …> so adding a new status to the backend
// surfaces here as a TS error instead of silently falling through to the
// default. Each value is an i18n key; the page resolves them at render.
const STATUS_HEADLINE: Record<TicketStatus, StringKey> = {
  waiting: "status.waiting",
  called: "status.called",
  serving: "status.serving",
  completed: "status.completed",
  no_show: "status.no_show",
  cancelled: "status.cancelled",
};

export default function StatusPage() {
  const params = useParams<{ ticketId: string }>();
  const { t } = useI18n();
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
        <h1 className="text-3xl">
          {isMissing ? t("dash.couldNotLoad") : t("common.error")}
        </h1>
        <p className="text-ink-muted">{error}</p>
        {!isMissing && (
          <button
            type="button"
            className="btn-ghost mx-auto mt-2"
            onClick={() => location.reload()}
          >
            {t("common.tryAgain")}
          </button>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col h-full justify-center text-center text-ink-subtle">
        {t("common.loading")}
      </div>
    );
  }

  const { ticket, position, waiting_count, now_serving } = data;
  const headline = t(STATUS_HEADLINE[ticket.status]);
  const isHighlighted = ticket.status === "called" || ticket.status === "serving";
  const accent = isHighlighted ? "bg-coral text-cream" : "bg-cream-raised text-ink";

  return (
    <div className="flex flex-col h-full gap-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-widest text-ink-subtle mb-2">
          #{ticket.ticket_number}
        </p>
        <h1 className="text-3xl font-serif tracking-tightest">{headline}</h1>
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
          {t("status.position")}
        </p>
        <p className="text-7xl font-serif tracking-tightest leading-none">
          {ticket.status === "waiting" ? (position ?? "—") : headline}
        </p>
        {ticket.status === "waiting" && (
          <p className={`mt-4 text-sm ${isHighlighted ? "" : "text-ink-muted"}`}>
            {waiting_count} · {now_serving ?? "—"}
          </p>
        )}
      </section>

      <p className="text-center text-xs text-ink-subtle">
        {t("status.live")} · {wsStatus}
      </p>
    </div>
  );
}
