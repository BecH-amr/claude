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

  // We don't have a backend list-tickets endpoint yet; this dashboard relies
  // on the queue's `current_ticket_number`/`now_serving` plus call-next
  // returning the next ticket. Local state holds owner-touched tickets so we
  // can show called/waiting rows without polling the full set.
  // Seeds `waiting_count` from the public read so the UI doesn't lie about
  // "0 waiting" before the first WS event arrives.
  const refreshQueue = useCallback(async () => {
    if (queueId === null) return;
    const myId = ++reqIdRef.current;
    try {
      const [list, pub] = await Promise.all([
        api.myQueues(),
        api.getQueue(queueId),
      ]);
      if (myId !== reqIdRef.current) return;
      const q = list.find((x) => x.id === queueId) ?? null;
      setQueue(q);
      setWaitingCount(pub.waiting_count);
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

  // Live updates from owner channel.
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
  }, [event]);

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

  // Active tickets the owner has touched recently (no backend list endpoint yet).
  const active = tickets.filter(
    (tt) => tt.queue_id === queueId && (tt.status === "called" || tt.status === "waiting"),
  );
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
