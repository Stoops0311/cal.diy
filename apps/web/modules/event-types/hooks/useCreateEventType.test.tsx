import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutationOptions: undefined as
    | {
        onError: (error: { data?: { code?: string; entitlement?: unknown }; message: string }) => void;
      }
    | undefined,
  onErrorMutation: vi.fn(),
  openUpgradePrompt: vi.fn(),
  session: { user: { org: { id: 41, role: "OWNER" } } } as {
    user: { org?: { id: number; role: "ADMIN" | "MEMBER" | "OWNER" } };
  },
}));

vi.mock("@calcom/atoms/hooks/event-types/private/useCreateEventTypeForm", () => ({
  useCreateEventTypeForm: () => ({ form: { reset: vi.fn() }, isManagedEventType: false }),
}));

vi.mock("@calcom/lib/hooks/useDebounce", () => ({ useDebounce: (value: string) => value }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: mocks.session }),
}));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      viewer: { eventTypes: { getEventTypesFromGroup: { fetchInfinite: vi.fn() } } },
    }),
    viewer: {
      eventTypesHeavy: {
        create: {
          useMutation: (options: NonNullable<typeof mocks.mutationOptions>) => {
            mocks.mutationOptions = options;
            return { mutate: vi.fn() };
          },
        },
      },
    },
  },
}));
vi.mock("../../billing/UpgradePromptProvider", () => ({
  useUpgradePrompt: () => ({ openUpgradePrompt: mocks.openUpgradePrompt }),
}));

import { resolveEventTypeBillingOrganizationId, useCreateEventType } from "./useCreateEventType";

const structuredCases = [
  { capability: "canCreateTeamEvents", effectivePlan: "FREE", kind: "capability" },
  { capability: "canUseCollectiveScheduling", effectivePlan: "FREE", kind: "capability" },
  { capability: "canUseRoundRobinScheduling", effectivePlan: "FREE", kind: "capability" },
] as const;

describe("useCreateEventType entitlement failures", () => {
  beforeEach(() => {
    mocks.mutationOptions = undefined;
    mocks.onErrorMutation.mockReset();
    mocks.openUpgradePrompt.mockReset();
    mocks.session = { user: { org: { id: 41, role: "OWNER" } } };
  });

  it.each(structuredCases)("opens the Team prompt for $capability", (entitlement) => {
    renderHook(() =>
      useCreateEventType(vi.fn(), mocks.onErrorMutation, {
        organizationId: 41,
        returnTo: "/event-types?dialog=new&eventPage=engineering&teamId=7&type=ROUND_ROBIN",
        teamId: 7,
      })
    );
    const error = { data: { entitlement }, message: "Forbidden" };

    act(() => mocks.mutationOptions?.onError(error));

    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: entitlement.capability,
        organizationId: 41,
        requiredPlan: "TEAM",
        returnTo: "/event-types?dialog=new&eventPage=engineering&teamId=7&type=ROUND_ROBIN",
      })
    );
    expect(mocks.onErrorMutation).not.toHaveBeenCalled();
  });

  it.each([
    {
      currentCount: 2,
      effectivePlan: "FREE",
      kind: "limit",
      limit: 2,
      resource: "activePersonalEventTypes",
    },
    { capability: "canUseAdvancedEvents", effectivePlan: "FREE", kind: "capability" },
  ] as const)("opens the Pro prompt for a personal $kind denial", (entitlement) => {
    renderHook(() =>
      useCreateEventType(vi.fn(), mocks.onErrorMutation, {
        returnTo: "/event-types?dialog=new&eventPage=alex&type=COLLECTIVE",
      })
    );
    const error = { data: { entitlement }, message: "Forbidden" };

    act(() => mocks.mutationOptions?.onError(error));

    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: entitlement.kind === "capability" ? entitlement.capability : entitlement.resource,
        requiredPlan: "PRO",
        returnTo: "/event-types?dialog=new&eventPage=alex&type=COLLECTIVE",
      })
    );
    expect(mocks.onErrorMutation).not.toHaveBeenCalled();
  });

  it("keeps subteam and billing organization IDs distinct for an organization admin", () => {
    mocks.session = { user: { org: { id: 41, role: "ADMIN" } } };
    renderHook(() =>
      useCreateEventType(vi.fn(), mocks.onErrorMutation, {
        organizationId: 41,
        returnTo: "/event-types?dialog=new&teamId=7",
        teamId: 7,
      })
    );
    const error = {
      data: {
        entitlement: { capability: "canCreateTeamEvents", effectivePlan: "FREE", kind: "capability" },
      },
      message: "Forbidden",
    };

    act(() => mocks.mutationOptions?.onError(error));

    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 41, requiredPlan: "TEAM" })
    );
  });

  it("does not prompt without an authoritative organization ID", () => {
    renderHook(() =>
      useCreateEventType(vi.fn(), mocks.onErrorMutation, {
        returnTo: "/event-types?dialog=new&teamId=7",
        teamId: 7,
      })
    );
    const error = {
      data: {
        entitlement: { capability: "canCreateTeamEvents", effectivePlan: "FREE", kind: "capability" },
      },
      message: "Forbidden",
    };

    act(() => mocks.mutationOptions?.onError(error));

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
    expect(mocks.onErrorMutation).toHaveBeenCalledWith("Forbidden");
  });

  it("does not prompt an ordinary organization member", () => {
    mocks.session = { user: { org: { id: 41, role: "MEMBER" } } };
    renderHook(() =>
      useCreateEventType(vi.fn(), mocks.onErrorMutation, {
        organizationId: 41,
        returnTo: "/event-types?dialog=new&teamId=41",
        teamId: 41,
      })
    );
    const error = {
      data: {
        entitlement: { capability: "canCreateTeamEvents", effectivePlan: "FREE", kind: "capability" },
      },
      message: "Forbidden",
    };

    act(() => mocks.mutationOptions?.onError(error));

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
    expect(mocks.onErrorMutation).toHaveBeenCalledWith("Forbidden");
  });

  it("preserves ordinary forbidden handling", () => {
    renderHook(() =>
      useCreateEventType(vi.fn(), mocks.onErrorMutation, {
        returnTo: "/event-types?dialog=new",
      })
    );
    const error = { data: { code: "FORBIDDEN" }, message: "Forbidden" };

    act(() => mocks.mutationOptions?.onError(error));

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
    expect(mocks.onErrorMutation).toHaveBeenCalledWith("Forbidden");
  });

  it("resolves only an actual parent organization or an exact manageable top-level organization", () => {
    expect(
      resolveEventTypeBillingOrganizationId({
        manageableOrganizationId: 41,
        parentOrganizationId: 41,
        teamId: 7,
      })
    ).toBe(41);
    expect(resolveEventTypeBillingOrganizationId({ manageableOrganizationId: 41, teamId: 41 })).toBe(41);
    expect(
      resolveEventTypeBillingOrganizationId({ manageableOrganizationId: 41, teamId: 7 })
    ).toBeUndefined();
    expect(resolveEventTypeBillingOrganizationId({ teamId: 41 })).toBeUndefined();
  });
});
