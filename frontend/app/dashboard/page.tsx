"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import type { QueueOut } from "@/lib/types";

export default function DashboardIndex() {
  const router = useRouter();
  const { token, business, ready, clear } = useAuth();
  const { t } = useI18n();
  const [queues, setQueues] = useState<QueueOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .myQueues()
      .then((qs) => !cancelled && setQueues(qs))
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clear();
          router.replace("/login");
          return;
        }
        setError(e instanceof ApiError ? e.message : "Could not load queues");
      });
    return () => {
      cancelled = true;
    };
  }, [token, clear, router]);

  if (!ready || !token) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs uppercase tracking-widest text-ink-subtle">
          {business?.name ?? "—"}
        </p>
        <LocaleSwitcher />
      </div>

      <header>
        <h1 className="text-3xl font-serif tracking-tightest">{t("dash.title")}</h1>
      </header>

      {error && (
        <p role="alert" className="card p-4 text-coral text-sm">
          {error}
        </p>
      )}

      {queues === null && !error && (
        <p className="text-ink-subtle text-center py-12">Loading…</p>
      )}

      {queues && queues.length === 0 && (
        <div className="card p-6 text-center flex flex-col items-center gap-4">
          <p className="text-ink-muted">No queues yet.</p>
          <Link href="/setup" className="btn-primary">
            {t("queue.create")}
          </Link>
        </div>
      )}

      {queues && queues.length > 0 && (
        <ul className="flex flex-col gap-3">
          {queues.map((q) => (
            <li key={q.id}>
              <Link
                href={`/dashboard/${q.id}`}
                className="card p-5 flex items-center justify-between hover:bg-cream-sunken transition"
              >
                <div className="min-w-0">
                  <p className="font-serif text-lg tracking-tightest truncate">{q.name}</p>
                  <p className="text-xs text-ink-subtle uppercase tracking-widest mt-0.5">
                    {q.status}
                  </p>
                </div>
                <span className="text-ink-subtle">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-6 flex items-center justify-between text-xs">
        <Link href="/setup" className="text-ink-muted hover:text-coral">
          + {t("queue.create")}
        </Link>
        <button
          type="button"
          onClick={() => {
            clear();
            router.replace("/login");
          }}
          className="text-ink-muted hover:text-coral"
        >
          {t("common.signOut")}
        </button>
      </div>
    </div>
  );
}
