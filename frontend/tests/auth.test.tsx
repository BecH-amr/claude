import { describe, expect, it } from "vitest";
import { render, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth";

function Probe({ onReady }: { onReady: (s: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  if (auth.ready) onReady(auth);
  return <div data-testid="ready">{String(auth.ready)}</div>;
}

describe("AuthProvider", () => {
  it("starts unauthed when localStorage is empty", async () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Probe onReady={(s) => (captured = s)} />
      </AuthProvider>,
    );
    await act(async () => {
      // give the post-render useEffect a tick to run
    });
    expect(captured!.ready).toBe(true);
    expect(captured!.token).toBeNull();
    expect(captured!.business).toBeNull();
  });

  it("rehydrates token + business from localStorage", async () => {
    localStorage.setItem("q.token", "tok-123");
    localStorage.setItem(
      "q.business",
      JSON.stringify({
        id: 7,
        name: "Joe",
        phone: "+15550100",
        business_type: "barber",
        address: null,
        city: null,
        country: null,
        created_at: "2026-04-28T00:00:00Z",
      }),
    );
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Probe onReady={(s) => (captured = s)} />
      </AuthProvider>,
    );
    await act(async () => {});
    expect(captured!.token).toBe("tok-123");
    expect(captured!.business?.id).toBe(7);
  });

  it("setSession + clear update localStorage and state", async () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Probe onReady={(s) => (captured = s)} />
      </AuthProvider>,
    );
    await act(async () => {});

    await act(async () => {
      captured!.setSession("new-tok", {
        id: 1,
        name: "X",
        phone: "+15550100",
        business_type: "other",
        address: null,
        city: null,
        country: null,
        created_at: "2026-04-28T00:00:00Z",
      });
    });
    expect(localStorage.getItem("q.token")).toBe("new-tok");
    expect(captured!.token).toBe("new-tok");

    await act(async () => {
      captured!.clear();
    });
    expect(localStorage.getItem("q.token")).toBeNull();
    expect(localStorage.getItem("q.business")).toBeNull();
    expect(captured!.token).toBeNull();
    expect(captured!.business).toBeNull();
  });

  it("does not crash when localStorage holds corrupt JSON", async () => {
    localStorage.setItem("q.token", "tok-x");
    localStorage.setItem("q.business", "{not json");
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Probe onReady={(s) => (captured = s)} />
      </AuthProvider>,
    );
    await act(async () => {});
    expect(captured!.ready).toBe(true);
    // Token survives because it's a plain string; business is dropped silently.
    expect(captured!.token).toBe("tok-x");
    expect(captured!.business).toBeNull();
  });
});
