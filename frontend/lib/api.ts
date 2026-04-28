import { readToken } from "./auth";
import type {
  BusinessType,
  QueueOut,
  QueuePublic,
  TicketOut,
  TicketPublic,
  TicketStatusResponse,
  TokenOut,
} from "./types";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  // Only set JSON content-type when there's actually a body — avoids tripping
  // CORS preflights on simple GETs.
  if (init.body) headers["Content-Type"] = "application/json";
  if (opts.auth) {
    const token = readToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b) => b?.detail ?? res.statusText)
      .catch(() => res.statusText);
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Encode a path-segment id so a malicious URL like /q/1%2F..%2Fadmin can't
// produce a request to /api/admin via browser path normalization.
const enc = (v: number | string) => encodeURIComponent(String(v));

export const api = {
  // Auth
  register: (body: {
    name: string;
    phone: string;
    password: string;
    business_type?: BusinessType;
    address?: string;
    city?: string;
    country?: string;
  }) =>
    request<TokenOut>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { phone: string; password: string }) =>
    request<TokenOut>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Queues — public
  getQueue: (queueId: number | string) =>
    request<QueuePublic>(`/api/queues/${enc(queueId)}`),

  joinQueue: (
    queueId: number | string,
    body: { customer_name?: string; customer_phone?: string },
  ) =>
    request<TicketPublic>(`/api/queues/${enc(queueId)}/join`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getTicketStatus: (ticketId: number | string) =>
    request<TicketStatusResponse>(`/api/tickets/${enc(ticketId)}`),

  // Queues — owner
  myQueues: () => request<QueueOut[]>("/api/queues/mine", {}, { auth: true }),

  createQueue: (body: {
    name: string;
    max_capacity?: number | null;
    close_on_max_reached?: boolean;
  }) =>
    request<QueueOut>(
      "/api/queues",
      { method: "POST", body: JSON.stringify(body) },
      { auth: true },
    ),

  updateQueue: (
    queueId: number,
    body: Partial<{
      name: string;
      max_capacity: number | null;
      close_on_max_reached: boolean;
    }>,
  ) =>
    request<QueueOut>(
      `/api/queues/${enc(queueId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
      { auth: true },
    ),

  openQueue: (queueId: number) =>
    request<QueueOut>(
      `/api/queues/${enc(queueId)}/open`,
      { method: "POST" },
      { auth: true },
    ),

  closeQueue: (queueId: number) =>
    request<QueueOut>(
      `/api/queues/${enc(queueId)}/close`,
      { method: "POST" },
      { auth: true },
    ),

  // Tickets — owner
  callNext: (queueId: number) =>
    request<TicketOut | null>(
      `/api/queues/${enc(queueId)}/call-next`,
      { method: "POST" },
      { auth: true },
    ),

  completeTicket: (ticketId: number) =>
    request<TicketOut>(
      `/api/tickets/${enc(ticketId)}/complete`,
      { method: "POST" },
      { auth: true },
    ),

  noShowTicket: (ticketId: number) =>
    request<TicketOut>(
      `/api/tickets/${enc(ticketId)}/no-show`,
      { method: "POST" },
      { auth: true },
    ),

  addWalkin: (
    queueId: number,
    body: { customer_name?: string; customer_phone?: string },
  ) =>
    request<TicketOut>(
      `/api/queues/${enc(queueId)}/add-walkin`,
      { method: "POST", body: JSON.stringify(body) },
      { auth: true },
    ),

  qrUrl: (queueId: number) => `/api/queues/${enc(queueId)}/qr`,
};

export { ApiError };
