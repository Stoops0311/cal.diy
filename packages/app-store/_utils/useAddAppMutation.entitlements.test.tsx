import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAddAppMutation from "./useAddAppMutation";

vi.mock("next/navigation", () => ({ usePathname: () => "/apps" }));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function response(body: unknown, status = 403): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const denial = {
  currentCount: 1,
  effectivePlan: "FREE",
  kind: "limit",
  limit: 1,
  resource: "connectedCalendars",
} as const;

describe("useAddAppMutation entitlement responses", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers an exact connected-calendar denial and preserves the error", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ entitlement: denial, message: "Calendar limit reached" }));
    const onEntitlementDenied = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(
      () => useAddAppMutation("google_calendar", { onEntitlementDenied, onError }),
      { wrapper }
    );

    await expect(result.current.mutateAsync("")).rejects.toThrow("Calendar limit reached");

    expect(onEntitlementDenied).toHaveBeenCalledWith(denial);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["generic 403 response", { message: "Forbidden" }, 403],
    ["provider 500 response", { message: "Provider unavailable", provider: "private" }, 500],
    ["wrong entitlement", { entitlement: { ...denial, resource: "activePersonalEventTypes" } }, 403],
    ["extra entitlement data", { entitlement: { ...denial, providerToken: "private" } }, 403],
  ])("does not notify for a %s", async (_name, body, status) => {
    vi.mocked(fetch).mockResolvedValue(response(body, status));
    const onEntitlementDenied = vi.fn();
    const { result } = renderHook(() => useAddAppMutation("google_calendar", { onEntitlementDenied }), {
      wrapper,
    });

    await expect(result.current.mutateAsync("")).rejects.toThrow();

    expect(onEntitlementDenied).not.toHaveBeenCalled();
  });

  it("does not notify for malformed JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not-json", { status: 500 }));
    const onEntitlementDenied = vi.fn();
    const { result } = renderHook(() => useAddAppMutation("google_calendar", { onEntitlementDenied }), {
      wrapper,
    });

    await expect(result.current.mutateAsync("")).rejects.toThrow();

    expect(onEntitlementDenied).not.toHaveBeenCalled();
  });

  it("preserves successful installation results", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ message: "Connected" }, 200));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAddAppMutation("google_calendar", { onSuccess }), { wrapper });

    await expect(result.current.mutateAsync("")).resolves.toEqual({
      message: "Connected",
      setupPending: false,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
