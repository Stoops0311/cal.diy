import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaidPlanCheckout } from "./usePaidPlanCheckout";

const mocks: {
  mutate: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  showToast: ReturnType<typeof vi.fn>;
} = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      billing: {
        createCheckout: {
          useMutation: () => ({ isPending: false, mutate: mocks.mutate, variables: undefined }),
        },
      },
    },
  },
}));

vi.mock("@calcom/ui/components/toast", () => ({ showToast: mocks.showToast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("usePaidPlanCheckout", () => {
  beforeEach(() => {
    mocks.mutate.mockClear();
    mocks.push.mockClear();
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
});
