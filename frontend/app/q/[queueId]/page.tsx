"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useQueueSocket } from "@/hooks/useQueueSocket";
import QueueCard from "@/components/QueueCard";
import type { QueuePublic } from "@/lib/types";

export default function JoinPage() {
  const params = useParams<{ queueId: string }>();
  const router = useRouter();
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
        <h1 className="text-3xl">{isMissing ? "Queue not found" : "Couldn't load queue"}</h1>
        <p className="text-ink-muted">{loadError}</p>
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

  if (!queue) {
    return (
      <div className="flex flex-col h-full justify-center text-center text-ink-subtle">
        Loading…
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
      router.push(`/t/${ticket.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not join, please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-widest text-ink-subtle mb-2">Join</p>
        <h1 className="text-3xl font-serif tracking-tightest">
          You&apos;re a tap away from your spot.
        </h1>
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
        <p className="card p-4 text-ink-muted text-sm">
          This queue isn&apos;t open right now. Check back later.
        </p>
      )}

      {isOpen && isFull && (
        <p className="card p-4 text-ink-muted text-sm">
          This queue is full at the moment. Try again in a few minutes.
        </p>
      )}

      {canJoin && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="name" className="label">
              Name <span className="text-ink-subtle">(optional)</span>
            </label>
            <input
              id="name"
              className="input"
              autoComplete="given-name"
              placeholder="What should we call you?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              aria-describedby={submitError ? "submit-error" : undefined}
            />
          </div>
          <div>
            <label htmlFor="phone" className="label">
              Phone <span className="text-ink-subtle">(optional, for a ping when you&apos;re up)</span>
            </label>
            <input
              id="phone"
              className="input"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+1 555 010 0100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
              aria-describedby={submitError ? "submit-error" : undefined}
            />
          </div>

          {submitError && (
            <p id="submit-error" className="text-coral text-sm font-medium" role="alert">
              {submitError}
            </p>
          )}

          <button type="submit" className="btn-primary mt-2" disabled={submitting}>
            {submitting ? "Joining…" : "Take my spot"}
          </button>

          <p className="text-xs text-ink-subtle text-center">
            No account, no tracking. Close this tab and come back anytime.
          </p>
        </form>
      )}
    </div>
  );
}
