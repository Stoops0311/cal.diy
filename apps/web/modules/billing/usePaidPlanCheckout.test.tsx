import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaidSelection } from "./PlanSelector";
import { usePaidPlanCheckout } from "./usePaidPlanCheckout";

type MutationOptions = {
  onError(): void;
  onSuccess(result: { checkoutUrl: string }): void;
};
const mocks: {
  assign: ReturnType<typeof vi.fn>;
  isPending: boolean;
  mutate: ReturnType<typeof vi.fn>;
  mutationOptions?: MutationOptions;
  push: ReturnType<typeof vi.fn>;
  showToast: ReturnType<typeof vi.fn>;
  variables?: PaidSelection;
} = vi.hoisted(() => ({
  assign: vi.fn(),
  isPending: false,
  mutate: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
  variables: undefined,
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => {
      if (key === "billing_checkout_error") return "Payment did not open. Try again.";
      return key;
    },
  }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      billing: {
        createCheckout: {
          useMutation: (options: MutationOptions) => {
            mocks.mutationOptions = options;
            return { isPending: mocks.isPending, mutate: mocks.mutate, variables: mocks.variables };
          },
        },
      },
    },
  },
}));

vi.mock("@calcom/ui/components/toast", () => ({ showToast: mocks.showToast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("usePaidPlanCheckout", () => {
  beforeEach(() => {
    mocks.assign.mockClear();
    mocks.isPending = false;
    mocks.mutate.mockClear();
    mocks.mutationOptions = undefined;
    mocks.push.mockClear();
    mocks.showToast.mockClear();
    mocks.variables = undefined;
    Object.defineProperty(window, "location", { value: { assign: mocks.assign }, writable: true });
  });

  it("uses the existing mutation for Pro without an organization subject", () => {
    const before = vi.fn();
    const { result } = renderHook(() =>
      usePaidPlanCheckout({ organizationId: 41, onBeforeNavigate: before })
    );
    act(() => result.current.startCheckout({ interval: "YEAR", plan: "PRO" }));

    expect(before).toHaveBeenCalledWith({ selection: { interval: "YEAR", plan: "PRO" } });
    expect(mocks.mutate).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });
    expect(before.mock.invocationCallOrder[0]).toBeLessThan(mocks.mutate.mock.invocationCallOrder[0]);
  });

  it("routes Team without an organization through bootstrap after its callback", () => {
    const before = vi.fn();
    const { result } = renderHook(() =>
      usePaidPlanCheckout({ returnTo: "/booking/book_123/logs", onBeforeNavigate: before })
    );
    act(() => result.current.startCheckout({ interval: "MONTH", plan: "TEAM" }));

    expect(before).toHaveBeenCalledWith({ selection: { interval: "MONTH", plan: "TEAM" } });
    expect(mocks.push).toHaveBeenCalledWith(
      "/settings/organizations/new?returnTo=%2Fbooking%2Fbook_123%2Flogs&interval=MONTH"
    );
    expect(before.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0]);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("submits Team with the resolved organization subject after its callback", () => {
    const before = vi.fn();
    const { result } = renderHook(() => usePaidPlanCheckout({ organizationId: 7, onBeforeNavigate: before }));
    act(() => result.current.startCheckout({ interval: "YEAR", plan: "TEAM" }, 41));

    expect(before).toHaveBeenCalledWith({
      selection: { interval: "YEAR", plan: "TEAM" },
      organizationId: 41,
    });
    expect(mocks.mutate).toHaveBeenCalledWith({ interval: "YEAR", organizationId: 41, plan: "TEAM" });
    expect(before.mock.invocationCallOrder[0]).toBeLessThan(mocks.mutate.mock.invocationCallOrder[0]);
  });

  it("preserves Polar callbacks and exposes the pending mutation plan", () => {
    mocks.isPending = true;
    mocks.variables = { interval: "MONTH", plan: "TEAM" };
    const { result } = renderHook(() => usePaidPlanCheckout());

    expect(result.current.pendingPlan).toBe("TEAM");
    act(() => mocks.mutationOptions?.onError());
    expect(mocks.showToast).toHaveBeenCalledWith("Payment did not open. Try again.", "error");
    act(() => mocks.mutationOptions?.onSuccess({ checkoutUrl: "https://polar.test/checkout" }));
    expect(mocks.assign).toHaveBeenCalledWith("https://polar.test/checkout");
  });

  it("keeps startCheckout stable while its dependencies are unchanged", () => {
    const before = vi.fn();
    const { result, rerender } = renderHook(() =>
      usePaidPlanCheckout({ organizationId: 41, returnTo: "/pricing", onBeforeNavigate: before })
    );
    const initial = result.current.startCheckout;
    rerender();
    expect(result.current.startCheckout).toBe(initial);
  });
});
