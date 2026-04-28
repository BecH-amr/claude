import type { QueuePublic, TicketPublic, TicketStatusResponse } from "./types";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Only set JSON content-type when there's actually a body. Avoids tripping
  // CORS preflights on simple GETs.
  if (init?.body) headers["Content-Type"] = "application/json";

  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b) => b?.detail ?? res.statusText)
      .catch(() => res.statusText);
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

// Encode a path-segment id so a malicious URL like /q/1%2F..%2Fadmin can't
// produce a request to /api/admin via browser path normalization.
const enc = (v: number | string) => encodeURIComponent(String(v));

export const api = {
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
};

export { ApiError };
