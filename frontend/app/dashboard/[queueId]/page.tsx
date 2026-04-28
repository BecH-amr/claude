"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDashboardSocket } from "@/hooks/useDashboardSocket";
import { useI18n } from "@/lib/i18n";
import QueueCard from "@/components/QueueCard";
import QRCode from "@/components/QRCode";
import TicketList from "@/components/TicketList";
import type { QueueOut, TicketOut } from "@/lib/types";

export default function QueueDashboard() {
  const router = useRouter();
  const params = useParams<{ queueId: string }>();
  const { token, ready, clear } = useAuth();
  const { t } = useI18n();
  const queueId = Number(params.queueId);

  const [queue, setQueue] = useState<QueueOut | null>(null);
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [waitingCount, setWaitingCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  // We don't have a backend list-tickets endpoint yet; this dashboard relies
  // on the queue's `current_ticket_number`/`now_serving` plus call-next
  // returning the next ticket. We keep recent owner-touched tickets in local
  // state so the UI shows the called/waiting one without polling all tickets.
  const refreshQueue = useCallback(async () => {
    if (!Number.isFinite(queueId)) return;
    const myId = ++reqIdRef.current;
    try {
      const list = await api.myQueues();
      if (myId !== reqIdRef.current) return;
      const q = list.find((x) => x.id === queueId) ?? null;
      setQueue(q);
      if (q) setWaitingCount(0); // best-effort; WS event will set real count
    } catch (err) {
      if (myId !== reqIdRef.current) return;
      if (err instanceof ApiError && err.status === 401) {
        clear();
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load queue");
    }
  }, [queueId, clear, router]);

  useEffect(() => {
    if (token) refreshQueue();
  }, [token, refreshQueue]);

  // Live updates from owner channel.
  const { event, status: wsStatus } = useDashboardSocket(
    Number.isFinite(queueId) ? queueId : null,
    token,
  );
  useEffect(() => {
    if (!event) return;
    setWaitingCount(event.waiting_count);
    setQueue((q) =>
      q
        ? {
            ...q,
            status: event.status,
            now_serving: event.now_serving,
            current_ticket_number: event.current_ticket_number,
          }
        : q,
    );
  }, [event]);

  async function callNext() {
    try {
      const ticket = await api.callNext(queueId);
      if (ticket) setTickets((prev) => mergeTicket(prev, ticket));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not call next");
    }
  }

  async function addWalkin() {
    try {
      const ticket = await api.addWalkin(queueId, {});
      setTickets((prev) => mergeTicket(prev, ticket));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add walk-in");
    }
  }

  async function complete(ticketId: number) {
    try {
      const ticket = await api.completeTicket(ticketId);
      setTickets((prev) => mergeTicket(prev, ticket));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete ticket");
    }
  }

  async function noShow(ticketId: number) {
    try {
      const ticket = await api.noShowTicket(ticketId);
      setTickets((prev) => mergeTicket(prev, ticket));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark no-show");
    }
  }

  async function toggleOpen() {
    if (!queue) return;
    try {
      const next =
        queue.status === "open"
          ? await api.closeQueue(queueId)
          : await api.openQueue(queueId);
      setQueue(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change queue status");
    }
  }

  if (!ready || !token) return null;

  if (!queue) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <Link href="/dashboard" className="text-ink-muted text-sm hover:text-coral w-fit">
          ← {t("dash.title")}
        </Link>
        {error ? (
          <p role="alert" className="card p-4 text-coral text-sm">{error}</p>
        ) : (
          <p className="text-ink-subtle text-center py-12">Loading…</p>
        )}
      </div>
    );
  }

  // Active tickets the owner has touched recently (no backend list endpoint yet).
  const active = tickets.filter(
    (tt) => tt.queue_id === queueId && (tt.status === "called" || tt.status === "waiting"),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between pt-2">
        <Link href="/dashboard" className="text-ink-muted text-sm hover:text-coral">
          ← {t("dash.title")}
        </Link>
        <span className="text-xs text-ink-subtle">
          {wsStatus === "open" ? "Live" : wsStatus}
        </span>
      </div>

      <header>
        <h1 className="text-3xl font-serif tracking-tightest">{queue.name}</h1>
      </header>

      <QueueCard
        businessName={t("dash.title")}
        queueName={queue.name}
        status={queue.status}
        waitingCount={waitingCount}
        nowServing={queue.now_serving}
      />

      {error && (
        <p role="alert" className="card p-4 text-coral text-sm">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={callNext} className="btn-primary">
          {t("dash.callNext")}
        </button>
        <button type="button" onClick={addWalkin} className="btn-ghost border border-line">
          {t("dash.addWalkin")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={toggleOpen}
          className="btn-ghost border border-line"
        >
          {queue.status === "open" ? t("dash.close") : t("dash.open")}
        </button>
        <button
          type="button"
          onClick={() => setShowQR((s) => !s)}
          className="btn-ghost border border-line"
        >
          {t("dash.printQR")}
        </button>
      </div>

      {showQR && (
        <div className="card p-6 flex flex-col items-center gap-3 print:shadow-none print:border-0">
          <QRCode queueId={queueId} />
          <p className="text-xs text-ink-subtle">{queue.name}</p>
        </div>
      )}

      <TicketList
        tickets={active}
        emptyLabel={t("dash.empty")}
        completeLabel={t("dash.complete")}
        noShowLabel={t("dash.noShow")}
        onComplete={complete}
        onNoShow={noShow}
      />
    </div>
  );
}

function mergeTicket(prev: TicketOut[], next: TicketOut): TicketOut[] {
  const idx = prev.findIndex((p) => p.id === next.id);
  if (idx === -1) return [...prev, next];
  const out = prev.slice();
  out[idx] = next;
  return out;
}
