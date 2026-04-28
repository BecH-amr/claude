"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function SetupPage() {
  const router = useRouter();
  const { token, ready } = useAuth();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [maxCapacityRaw, setMaxCapacityRaw] = useState("");
  const [closeOnMax, setCloseOnMax] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const capRaw = maxCapacityRaw.trim();
      let max_capacity: number | null = null;
      if (capRaw !== "") {
        // parseInt + isInteger gate floats, NaN, negative, and zero. Number()
        // accepts all four and coerces NaN→null in JSON, which the backend
        // would interpret as "unlimited" — the opposite of the user's intent.
        const parsed = Number.parseInt(capRaw, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error(t("common.error"));
        }
        max_capacity = parsed;
      }
      const queue = await api.createQueue({
        name: name.trim(),
        max_capacity,
        close_on_max_reached: closeOnMax,
      });
      router.push(`/dashboard/${encodeURIComponent(String(queue.id))}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex flex-col h-full justify-center text-center text-ink-subtle">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-widest text-ink-subtle mb-2">Setup</p>
        <h1 className="text-3xl font-serif tracking-tightest">{t("queue.create")}</h1>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="qname" className="label">
            {t("queue.name")}
          </label>
          <input
            id="qname"
            className="input"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Haircuts, General consultation, …"
          />
        </div>
        <div>
          <label htmlFor="cap" className="label">
            {t("queue.maxCapacity")}{" "}
            <span className="text-ink-subtle">
              ({t("queue.unlimited")} = blank)
            </span>
          </label>
          <input
            id="cap"
            type="number"
            inputMode="numeric"
            min={1}
            className="input"
            value={maxCapacityRaw}
            onChange={(e) => setMaxCapacityRaw(e.target.value)}
            dir="ltr"
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={closeOnMax}
            onChange={(e) => setCloseOnMax(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-line text-coral focus:ring-coral/50"
          />
          <span className="text-sm text-ink-muted">
            Auto-close the queue once it reaches max capacity.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-coral text-sm font-medium">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-2" disabled={submitting}>
          {submitting ? "…" : t("queue.create")}
        </button>
      </form>
    </div>
  );
}
