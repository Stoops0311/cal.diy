import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntitlementUpgradeBridgeProvider, useEntitlementDeniedHandler } from "./EntitlementUpgradeBridge";
import useAddAppMutation from "./useAddAppMutation";

vi.mock("next/navigation", () => ({ usePathname: () => "/apps" }));

const denial = {
  currentCount: 1,
  effectivePlan: "FREE",
  kind: "limit",
  limit: 1,
  resource: "connectedCalendars",
} as const;

describe("EntitlementUpgradeBridge", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ entitlement: denial, message: "Calendar limit reached" }), {
          status: 403,
        })
      )
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("gives nested consumers the handler and leaves outside consumers safe", () => {
    const handler = vi.fn();
    const outside = renderHook(() => useEntitlementDeniedHandler());
    const inside = renderHook(() => useEntitlementDeniedHandler(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <EntitlementUpgradeBridgeProvider onEntitlementDenied={handler}>
          {children}
        </EntitlementUpgradeBridgeProvider>
      ),
    });

    expect(outside.result.current).toBeUndefined();
    expect(inside.result.current).toBe(handler);
  });

  it("delivers useAddAppMutation denials through the nearest bridge", async () => {
    const handler = vi.fn();
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <EntitlementUpgradeBridgeProvider onEntitlementDenied={handler}>
          {children}
        </EntitlementUpgradeBridgeProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAddAppMutation("google_calendar"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("")).rejects.toThrow("Calendar limit reached");
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(denial);
  });

  it("renders provider children unchanged", () => {
    const view = render(
      <EntitlementUpgradeBridgeProvider onEntitlementDenied={vi.fn()}>
        <span>calendar settings</span>
      </EntitlementUpgradeBridgeProvider>
    );

    expect(view.getByText("calendar settings")).toBeInTheDocument();
  });
});
