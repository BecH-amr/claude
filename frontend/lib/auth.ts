"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createElement } from "react";
import type { BusinessOut } from "./types";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessOut | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const b = localStorage.getItem(BIZ_KEY);
      if (t) setToken(t);
      if (b) setBusiness(JSON.parse(b) as BusinessOut);
    } catch {
      // ignore — corrupted storage just means logged out
    }
    setReady(true);
  }, []);

  const setSession = (t: string, b: BusinessOut) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(BIZ_KEY, JSON.stringify(b));
    setToken(t);
    setBusiness(b);
  };

  const clear = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(BIZ_KEY);
    setToken(null);
    setBusiness(null);
  };

  return createElement(
    AuthContext.Provider,
    { value: { token, business, ready, setSession, clear } },
    children,
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
