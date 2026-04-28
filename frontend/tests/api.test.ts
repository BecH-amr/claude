import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

/**
 * These tests guard the URL-encoding fix that closes a path-traversal-via-URL
 * primitive in the Next.js app router (segment params arrive *decoded*, so
 * `/q/1%2F..%2Fadmin` would otherwise yield `fetch("/api/queues/1/../admin")`
 * and the browser would normalize it to `/api/admin`). Every dynamic id MUST
 * pass through encodeURIComponent.
 */

describe("api: URL encoding", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("q.token", "tok");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes queue id in getQueue", async () => {
    await api.getQueue("1/../admin");
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe("/api/queues/1%2F..%2Fadmin");
    // Critical assertion: the path must NOT contain a literal slash that
    // would let the browser normalize a way out of /api/queues/.
    expect(url).not.toContain("/admin");
  });

  it("encodes queue id in joinQueue", async () => {
    await api.joinQueue("1/../admin", { customer_name: "x" });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe("/api/queues/1%2F..%2Fadmin/join");
  });

  it("encodes ticket id in getTicketStatus", async () => {
    await api.getTicketStatus("9/../foo");
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe("/api/tickets/9%2F..%2Ffoo");
  });

  it("encodes queue id in qrUrl", () => {
    expect(api.qrUrl(42)).toBe("/api/queues/42/qr");
    // Even numbers are passed through encodeURIComponent so the contract holds
    // if the helper is later widened to accept strings.
  });

  it("encodes queue id on owner endpoints", async () => {
    await api.callNext(7);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/queues/7/call-next");

    await api.openQueue(7);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/queues/7/open");

    await api.addWalkin(7, {});
    expect(fetchMock.mock.calls[2][0]).toBe("/api/queues/7/add-walkin");
  });
});

describe("api: auth header", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Fresh Response per call — Response bodies are single-use.
    fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches Authorization for auth-bearing endpoints", async () => {
    localStorage.setItem("q.token", "secret-token");
    await api.myQueues();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret-token",
    );
  });

  it("does NOT attach Authorization for public endpoints", async () => {
    localStorage.setItem("q.token", "secret-token");
    await api.getQueue(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("omits Authorization when no token is stored", async () => {
    await api.myQueues();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("api: error handling", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Phone already registered" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws ApiError with backend detail message", async () => {
    await expect(
      api.register({ name: "x", phone: "+15550100", password: "hunter22" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "Phone already registered",
    });
  });

  it("ApiError carries status code", async () => {
    try {
      await api.register({ name: "x", phone: "+15550100", password: "hunter22" });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(409);
    }
  });
});
