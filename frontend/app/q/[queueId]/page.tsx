"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useQueueSocket } from "@/hooks/useQueueSocket";
import QueueCard from "@/components/QueueCard";
import type { QueuePublic } from "@/lib/types";

export default function JoinPage() {
  const params = useParams<{ queueId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const queueId = params.queueId;

  const [queue, setQueue] = useState<QueuePublic | null>(null);
  const [loadStatus, setLoadStatus] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .getQueue(queueId)
      .then((q) => {
        if (cancelled) return;
        setQueue(q);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError) {
          setLoadStatus(e.status);
          setLoadError(e.message);
        } else {
          setLoadStatus(null);
          setLoadError("Could not load queue");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [queueId]);

  // Live updates: merge each WS event into queue state via functional updater
  // so concurrent events don't drop each other.
  const { event } = useQueueSocket(queueId);
  useEffect(() => {
    if (!event) return;
    setQueue((q) =>
      q
        ? {
            ...q,
            status: event.status,
            now_serving: event.now_serving,
            waiting_count: event.waiting_count,
          }
        : q,
    );
  }, [event]);

  if (loadError) {
    const isMissing = loadStatus === 404;
    return (
      <div className="flex flex-col h-full justify-center text-center gap-3">
        <h1 className="text-3xl">
          {isMissing ? t("dash.couldNotLoad") : t("common.error")}
        </h1>
        <p className="text-ink-muted">{loadError}</p>
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

  if (!queue) {
    return (
      <div className="flex flex-col h-full justify-center text-center text-ink-subtle">
        {t("common.loading")}
      </div>
    );
  }

  const isOpen = queue.status === "open";
  const isFull =
    queue.max_capacity !== null && queue.waiting_count >= queue.max_capacity;
  const canJoin = isOpen && !isFull;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canJoin || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const ticket = await api.joinQueue(queueId, {
        customer_name: name.trim() || undefined,
        customer_phone: phone.trim() || undefined,
      });
      router.push(`/t/${encodeURIComponent(String(ticket.id))}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("common.error"));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2">
        <h1 className="text-3xl font-serif tracking-tightest">{t("join.title")}</h1>
      </header>

      <div aria-live="polite">
        <QueueCard
          businessName={queue.business_name}
          queueName={queue.name}
          status={queue.status}
          waitingCount={queue.waiting_count}
          nowServing={queue.now_serving}
        />
      </div>

      {!isOpen && (
        <p className="card p-4 text-ink-muted text-sm">{t("join.closed")}</p>
      )}

      {isOpen && isFull && (
        <p className="card p-4 text-ink-muted text-sm">{t("join.full")}</p>
      )}

      {canJoin && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="name" className="label">
              {t("join.name")}{" "}
              <span className="text-ink-subtle">{t("join.optional")}</span>
            </label>
            <input
              id="name"
              className="input"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              aria-describedby={submitError ? "submit-error" : undefined}
            />
          </div>
          <div>
            <label htmlFor="phone" className="label">
              {t("join.phone")}{" "}
              <span className="text-ink-subtle">{t("join.optional")}</span>
            </label>
            <input
              id="phone"
              className="input"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="22 06 54 94"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
              aria-describedby={submitError ? "submit-error" : undefined}
              dir="ltr"
            />
          </div>

          {submitError && (
            <p id="submit-error" className="text-coral text-sm font-medium" role="alert">
              {submitError}
            </p>
          )}

          <button type="submit" className="btn-primary mt-2" disabled={submitting}>
            {submitting ? t("join.submitting") : t("join.submit")}
          </button>
        </form>
      )}
    </div>
  );
}
