import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEventType: vi.fn(),
  eventTypes: [] as unknown[],
  push: vi.fn(),
  refetch: vi.fn(),
  showToast: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => (key === "something_went_wrong" ? "Something went wrong" : key) }),
}));
vi.mock("@calcom/lib/webstorage", () => ({ sessionStorage: { getItem: vi.fn(() => null) } }));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: mocks.showToast }));
vi.mock("@calcom/web/modules/shell/hooks/useWelcomeToCalcomModal", () => ({
  setShowWelcomeToCalcomModalFlag: vi.fn(),
}));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({ viewer: { me: { get: { refetch: mocks.refetch } } } }),
    viewer: {
      eventTypes: { list: { useQuery: () => ({ data: mocks.eventTypes }) } },
      eventTypesHeavy: {
        create: { useMutation: () => ({ isPending: false, mutateAsync: mocks.createEventType }) },
      },
      me: {
        updateProfile: {
          useMutation: (options: { onError(error: Error): void; onSuccess(): Promise<void> }) => ({
            isPending: false,
            mutate: (input: unknown) => {
              void mocks.updateProfile(input).then(options.onSuccess, options.onError);
            },
            mutateAsync: mocks.updateProfile,
          }),
        },
      },
    },
  },
}));

import { useSubmitPersonalOnboarding } from "../useSubmitPersonalOnboarding";

describe("useSubmitPersonalOnboarding", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const mock of Object.values(mocks)) if (typeof mock === "function") mock.mockReset();
    mocks.eventTypes = [];
    mocks.createEventType.mockResolvedValue(undefined);
    mocks.refetch.mockResolvedValue(undefined);
    mocks.updateProfile.mockResolvedValue(undefined);
  });

  it("runs paid continuation after profile, defaults, and refetch", async () => {
    const afterComplete = vi.fn();
    const { result } = renderHook(() => useSubmitPersonalOnboarding());

    await act(() => result.current.submitPersonalOnboarding({ afterComplete }));

    expect(mocks.updateProfile).toHaveBeenCalledWith({ completedOnboarding: true });
    expect(mocks.createEventType).toHaveBeenCalledTimes(3);
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(afterComplete).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refetch.mock.invocationCallOrder[0]).toBeLessThan(afterComplete.mock.invocationCallOrder[0]);
  });

  it("does not continue when completion fails", async () => {
    mocks.updateProfile.mockRejectedValue(new Error("failed"));
    const afterComplete = vi.fn();
    const { result } = renderHook(() => useSubmitPersonalOnboarding());

    await act(() => result.current.submitPersonalOnboarding({ afterComplete }));

    expect(afterComplete).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith("Something went wrong", "error");
  });
});
