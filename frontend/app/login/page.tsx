"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LocaleSwitcher from "@/components/LocaleSwitcher";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session =
        mode === "login"
          ? await api.login({ phone: phone.trim(), password })
          : await api.register({
              name: name.trim(),
              phone: phone.trim(),
              password,
            });
      setSession(session.access_token, session.business);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      // finally so the button re-enables on every code path. router.push
      // unmounts on success; in tests where it doesn't, the form is usable.
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs uppercase tracking-widest text-ink-subtle">Q</p>
        <LocaleSwitcher />
      </div>

      <header>
        <h1 className="text-3xl font-serif tracking-tightest">
          {mode === "login" ? t("auth.login") : t("auth.register")}
        </h1>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {mode === "register" && (
          <div>
            <label htmlFor="name" className="label">
              {t("auth.businessName")}
            </label>
            <input
              id="name"
              className="input"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="organization"
            />
          </div>
        )}
        <div>
          <label htmlFor="phone" className="label">
            {t("auth.phone")}
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            className="input"
            required
            maxLength={32}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            dir="ltr"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t("auth.password")}
          </label>
          <input
            id="password"
            type="password"
            className="input"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            dir="ltr"
          />
        </div>

        {error && (
          <p role="alert" className="text-coral text-sm font-medium">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-2" disabled={submitting}>
          {submitting ? "…" : mode === "login" ? t("auth.login") : t("auth.register")}
        </button>
      </form>

      <p className="text-center text-sm text-ink-muted">
        {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError(null);
          }}
          className="underline underline-offset-2 text-ink hover:text-coral"
        >
          {mode === "login" ? t("auth.register") : t("auth.login")}
        </button>
      </p>
    </div>
  );
}
