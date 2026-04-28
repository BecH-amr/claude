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
  const queueIdNum = Number(params.queueId);
  const validId = Number.isFinite(queueIdNum) && queueIdNum > 0;
  const queueId = validId ? queueIdNum : null;

  const [queue, setQueue] = useState<QueueOut | null>(null);
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [waitingCount, setWaitingCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  // Pulls everything the dashboard needs to render correctly after a hard
  // reload: queue metadata, public counts, and the active ticket list
  // (waiting + called + serving). Without this last fetch the called user
  // disappears from the UI on refresh — the bug that surfaced in dev.
  const refreshQueue = useCallback(async () => {
    if (queueId === null) return;
    const myId = ++reqIdRef.current;
    try {
      const [list, pub, active] = await Promise.all([
        api.myQueues(),
        api.getQueue(queueId),
        api.listActiveTickets(queueId),
      ]);
      if (myId !== reqIdRef.current) return;
      const q = list.find((x) => x.id === queueId) ?? null;
      setQueue(q);
      setWaitingCount(pub.waiting_count);
      setTickets(active);
      setError(null);
    } catch (err) {
      if (myId !== reqIdRef.current) return;
      if (err instanceof ApiError && err.status === 401) {
        clear();
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("dash.couldNotLoad"));
    }
  }, [queueId, clear, router, t]);

  useEffect(() => {
    if (token) refreshQueue();
  }, [token, refreshQueue]);

  // Live updates from owner channel. WS events update counts + queue state
  // optimistically; ticket-touching events trigger a refetch of the active
  // list so a join from another tab shows up here without manual reload.
  const { event, status: wsStatus } = useDashboardSocket(queueId, token);
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
    // Any ticket-state change can affect the active list; the cheapest
    // correct path is to re-fetch. The reqIdRef guard inside refreshQueue
    // makes overlapping calls safe.
    if (
      event.event === "ticket.joined" ||
      event.event === "ticket.called" ||
      event.event === "ticket.completed" ||
      event.event === "ticket.no_show"
    ) {
      refreshQueue();
    }
  }, [event, refreshQueue]);

  /**
   * Generic mutation wrapper:
   *   - guards against double-submit by tagging `busy` with the action key
   *   - clears stale errors on every fresh attempt
   *   - centralizes 401 → re-login redirect
   */
  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (busy || queueId === null) return;
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clear();
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.error"));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const callNext = () =>
    run("callNext", async () => {
      const ticket = await api.callNext(queueId!);
      if (ticket) setTickets((prev) => mergeTicket(prev, ticket));
    });

  const addWalkin = () =>
    run("walkin", async () => {
      const ticket = await api.addWalkin(queueId!, {});
      setTickets((prev) => mergeTicket(prev, ticket));
    });

  const complete = (ticketId: number) =>
    run(`complete:${ticketId}`, async () => {
      const ticket = await api.completeTicket(ticketId);
      setTickets((prev) => mergeTicket(prev, ticket));
    });

  const noShow = (ticketId: number) =>
    run(`noshow:${ticketId}`, async () => {
      const ticket = await api.noShowTicket(ticketId);
      setTickets((prev) => mergeTicket(prev, ticket));
    });

  const toggleOpen = () =>
    run("toggle", async () => {
      if (!queue) return;
      const next =
        queue.status === "open"
          ? await api.closeQueue(queueId!)
          : await api.openQueue(queueId!);
      setQueue(next);
    });

  if (!ready || !token) return null;

  if (!validId) {
    return (
      <div className="flex flex-col h-full justify-center text-center gap-3">
        <h1 className="text-3xl">{t("dash.couldNotLoad")}</h1>
        <p className="text-ink-muted">Invalid queue id.</p>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <Link href="/dashboard" className="text-ink-muted text-sm hover:text-coral w-fit">
          ← {t("dash.title")}
        </Link>
        {error ? (
          <p role="alert" className="card p-4 text-coral text-sm">{error}</p>
        ) : (
          <p className="text-ink-subtle text-center py-12">{t("common.loading")}</p>
        )}
      </div>
    );
  }

  // The list endpoint returns exactly the working set (waiting+called+serving)
  // so we trust its order and contents directly.
  const active = tickets.filter((tt) => tt.queue_id === queueId);
  const wsLabel =
    wsStatus === "open"
      ? t("status.live")
      : wsStatus === "reconnecting"
      ? "…"
      : wsStatus;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between pt-2">
        <Link href="/dashboard" className="text-ink-muted text-sm hover:text-coral">
          ← {t("dash.title")}
        </Link>
        <span role="status" aria-live="polite" className="text-xs text-ink-subtle">
          {wsLabel}
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
        <button
          type="button"
          onClick={callNext}
          className="btn-primary"
          disabled={busy !== null}
        >
          {t("dash.callNext")}
        </button>
        <button
          type="button"
          onClick={addWalkin}
          className="btn-ghost border border-line"
          disabled={busy !== null}
        >
          {t("dash.addWalkin")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={toggleOpen}
          className="btn-ghost border border-line"
          disabled={busy !== null}
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

      {showQR && queueId !== null && (
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
