"use client";

/**
 * Auth context.
 *
 * Threat model — read this before changing token storage:
 *   We persist the JWT in localStorage. This is XSS-exfiltratable: any
 *   script that runs on the same origin can read `q.token` and POST it
 *   anywhere. We accept that trade-off because (a) WebSocket upgrades
 *   can't carry an Authorization header, so an HttpOnly cookie alone
 *   wouldn't cover the dashboard channel, and (b) we have no third-party
 *   script tags. If either changes — adding analytics, ad SDKs, or any
 *   user-content rendering — move the token to an HttpOnly Secure
 *   SameSite=Strict cookie and accept the WS auth complexity.
 *
 *   Mitigations in place:
 *     - Strict CSP-friendly setup (no inline scripts)
 *     - localStorage value parsed defensively (see `readBusiness`)
 *     - JWT exp claim checked client-side before use (see `readToken`)
 *     - On sign-out we proactively flush any `apis` SW cache.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { BusinessOut, BusinessType } from "./types";

const TOKEN_KEY = "q.token";
const BIZ_KEY = "q.business";

interface AuthState {
  token: string | null;
  business: BusinessOut | null;
  ready: boolean;
  setSession: (token: string, business: BusinessOut) => void;
  clear: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const VALID_BUSINESS_TYPES: ReadonlySet<BusinessType> = new Set<BusinessType>([
  "clinic",
  "barber",
  "gov",
  "restaurant",
  "other",
]);

// Runtime guard so a malformed/edited localStorage value can't crash the
// dashboard at first field access. We trust nothing that came back from
// disk — the prior `as BusinessOut` cast was a compile-time-only lie.
function isBusinessOut(v: unknown): v is BusinessOut {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "number" &&
    typeof o.name === "string" &&
    typeof o.phone === "string" &&
    typeof o.business_type === "string" &&
    VALID_BUSINESS_TYPES.has(o.business_type as BusinessType)
  );
}

/** Decode the `exp` (seconds since epoch) from a JWT without verifying. */
function jwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded);
    const obj = JSON.parse(json) as { exp?: unknown };
    return typeof obj.exp === "number" ? obj.exp : null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = jwtExp(token);
  if (exp === null) return false; // can't tell; let the server reject
  return Date.now() / 1000 >= exp;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessOut | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedBiz = localStorage.getItem(BIZ_KEY);

      // Drop expired tokens at boot rather than letting the next API call
      // 401 — saves a roundtrip and keeps "ready" honest.
      if (storedToken && !isExpired(storedToken)) {
        setToken(storedToken);
      } else if (storedToken) {
        localStorage.removeItem(TOKEN_KEY);
      }

      if (storedBiz) {
        const parsed: unknown = JSON.parse(storedBiz);
        if (isBusinessOut(parsed)) {
          setBusiness(parsed);
        } else {
          localStorage.removeItem(BIZ_KEY);
        }
      }
    } catch {
      // Corrupted storage just means logged out — drop both.
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(BIZ_KEY);
    }
    // Must run even on parse failure, otherwise `ready` stays false forever
    // and the entire app blocks behind the loading splash.
    setReady(true);
  }, []);

  const setSession = useCallback((newToken: string, newBusiness: BusinessOut) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(BIZ_KEY, JSON.stringify(newBusiness));
    setToken(newToken);
    setBusiness(newBusiness);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(BIZ_KEY);
    setToken(null);
    setBusiness(null);
    // Defense-in-depth: even though next-pwa is configured NetworkOnly for
    // /api/*, a user who installed an older build may have an `apis` cache
    // with previous-owner data. Flush on sign-out.
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((names) =>
          Promise.all(names.filter((n) => n === "apis").map((n) => caches.delete(n))),
        )
        .catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider value={{ token, business, ready, setSession, clear }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Read the persisted token, returning null if missing or expired. */
export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  if (isExpired(raw)) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return raw;
}
