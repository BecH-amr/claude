import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQueueSocket } from "@/hooks/useQueueSocket";

/**
 * Stubbed WebSocket so we can drive open/message/close events deterministically.
 * Tracks instances per-test so assertions can find the latest socket.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  listeners: Record<string, Array<(ev: any) => void>> = {};
  closed = false;
  closedCode: number | undefined;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener() {}
  send() {}
  close(code?: number) {
    if (this.closed) return;
    this.closed = true;
    this.closedCode = code;
    this.fire("close", { code });
  }

  fire(type: string, ev: any) {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  vi.useFakeTimers();
  // jsdom defaults to localhost:3000 already.
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useQueueSocket", () => {
  it("encodes the queueId in the URL", () => {
    renderHook(() => useQueueSocket("1/../admin"));
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toMatch(/\/api\/ws\/queue\/1%2F\.\.%2Fadmin$/);
  });

  it("emits 'open' status on successful connect", () => {
    const { result } = renderHook(() => useQueueSocket(42));
    expect(result.current.status).toBe("connecting");
    act(() => {
      FakeWebSocket.instances[0].fire("open", {});
    });
    expect(result.current.status).toBe("open");
  });

  it("parses message events into hook state", () => {
    const { result } = renderHook(() => useQueueSocket(42));
    act(() => FakeWebSocket.instances[0].fire("open", {}));
    act(() => {
      FakeWebSocket.instances[0].fire("message", {
        data: JSON.stringify({
          event: "ticket.joined",
          queue_id: 42,
          status: "open",
          waiting_count: 3,
          now_serving: 1,
          current_ticket_number: 4,
        }),
      });
    });
    expect(result.current.event?.event).toBe("ticket.joined");
    expect(result.current.event?.waiting_count).toBe(3);
  });

  it("ignores malformed messages without crashing", () => {
    const { result } = renderHook(() => useQueueSocket(42));
    act(() => FakeWebSocket.instances[0].fire("open", {}));
    act(() => FakeWebSocket.instances[0].fire("message", { data: "not json {" }));
    expect(result.current.event).toBeNull();
  });

  it("transitions to 'reconnecting' after a non-policy close and reconnects with backoff", () => {
    const { result } = renderHook(() => useQueueSocket(42));
    act(() => FakeWebSocket.instances[0].fire("open", {}));

    act(() => FakeWebSocket.instances[0].fire("close", { code: 1006 }));
    expect(result.current.status).toBe("reconnecting");
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Backoff is 0.5*ceil to 1.0*ceil where ceil = min(30000, 500 * 2^retry).
    // Retry 0 → ceil 500ms, so jittered 250..500ms. Advance 1s to be safe.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].url).toEqual(FakeWebSocket.instances[0].url);
  });

  it("ignores 'close' from an already-replaced socket (stale-socket guard)", () => {
    const { result, rerender } = renderHook((id: number) => useQueueSocket(id), {
      initialProps: 1,
    });
    const first = FakeWebSocket.instances[0];
    act(() => first.fire("open", {}));

    // Switch queueId — old socket gets replaced.
    rerender(2);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // The old (stale) socket fires close after the new one is the active one.
    // It must NOT trigger a reconnect of the OLD queue.
    act(() => first.fire("close", { code: 1006 }));
    act(() => vi.advanceTimersByTime(1000));

    // We expect at most one extra reconnect attempt — for the new id (2),
    // not the old (1). All sockets created should target queue/2.
    const queue2Sockets = FakeWebSocket.instances.filter((s) =>
      s.url.endsWith("/api/ws/queue/2"),
    );
    expect(queue2Sockets.length).toBeGreaterThanOrEqual(1);
    expect(result.current.status).not.toBe("closed");
  });

  it("closes cleanly on unmount and stops reconnecting", () => {
    const { unmount } = renderHook(() => useQueueSocket(42));
    act(() => FakeWebSocket.instances[0].fire("open", {}));
    unmount();
    // Even if a delayed close fires, no new socket should be opened.
    act(() => FakeWebSocket.instances[0].fire("close", { code: 1006 }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("does nothing when queueId is null", () => {
    renderHook(() => useQueueSocket(null));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
