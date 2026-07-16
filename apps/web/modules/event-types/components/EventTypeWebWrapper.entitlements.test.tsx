import type { EntitlementDenial } from "@calcom/features/billing/lib/entitlementDenial";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const copy = {
  billing_upgrade_active_personal_event_types_description:
    "Publish another way to meet without taking an existing link offline.",
  billing_upgrade_active_personal_event_types_feature: "Another event type",
  billing_upgrade_create_team_events_description:
    "Put the people, roles, and availability behind one team link.",
  billing_upgrade_create_team_events_feature: "Shared event types",
  billing_upgrade_use_advanced_events_description: "Set buffers, limits, and seat rules around the meeting.",
  billing_upgrade_use_advanced_events_feature: "Advanced event terms",
  billing_upgrade_use_booking_payments_description: "Collect payment as part of the booking terms.",
  billing_upgrade_use_booking_payments_feature: "Booking payments",
  billing_upgrade_use_collective_scheduling_description:
    "Offer times only when every required calendar can hold them.",
  billing_upgrade_use_collective_scheduling_feature: "Collective scheduling",
  billing_upgrade_use_custom_booking_fields_description:
    "Collect the terms needed before the meeting is agreed.",
  billing_upgrade_use_custom_booking_fields_feature: "Custom booking questions",
  billing_upgrade_use_custom_redirects_description: "Carry a confirmed booking to the next step.",
  billing_upgrade_use_custom_redirects_feature: "Booking redirects",
  billing_upgrade_use_private_links_description:
    "Share specific terms without publishing another public event type.",
  billing_upgrade_use_private_links_feature: "Private links",
  billing_upgrade_use_recurring_events_description:
    "State the cadence once and keep every occurrence together.",
  billing_upgrade_use_recurring_events_feature: "Recurring meetings",
  billing_upgrade_use_round_robin_scheduling_description:
    "Distribute meetings while the team keeps one booking record.",
  billing_upgrade_use_round_robin_scheduling_feature: "Round-robin scheduling",
} as const;

const mocks = vi.hoisted(() => ({
  openUpgradePrompt: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: { user: { org: { id: 41, role: "OWNER" } } } }),
}));
vi.mock("@calcom/atoms/event-types/hooks/useEventTypeForm", () => ({ useEventTypeForm: vi.fn() }));
vi.mock("@calcom/atoms/event-types/hooks/useHandleRouteChange", () => ({ useHandleRouteChange: vi.fn() }));
vi.mock("@calcom/atoms/event-types/hooks/useTabsNavigations", () => ({ useTabsNavigations: vi.fn() }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => copy[key as keyof typeof copy] ?? key,
  }),
}));
vi.mock("@calcom/lib/hooks/useTypedQuery", () => ({ useTypedQuery: vi.fn() }));
vi.mock("@calcom/trpc/react", () => ({ trpc: {}, RouterOutputs: {} }));
vi.mock("@calcom/trpc/react/hooks/useMeQuery", () => ({ default: vi.fn() }));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: vi.fn() }));
vi.mock("@calcom/web/app/(use-page-wrapper)/event-types/[type]/actions", () => ({
  revalidateEventTypeEditPage: vi.fn(),
}));
vi.mock("../../billing/UpgradePromptProvider", () => ({
  useUpgradePrompt: () => ({ openUpgradePrompt: mocks.openUpgradePrompt }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn(), useRouter: vi.fn(), useSearchParams: vi.fn() }));
vi.mock("./EventType", () => ({ EventType: () => null }));

import { useEntitlementUpgrade } from "../../billing/useEntitlementUpgrade";
import { getEventTypeUpdateUpgradeContext, handleEventTypeUpdateError } from "./EventTypeWebWrapper";

const capabilities = [
  [
    "canCreateTeamEvents",
    "Shared event types",
    "Put the people, roles, and availability behind one team link.",
    true,
  ],
  [
    "canUseCollectiveScheduling",
    "Collective scheduling",
    "Offer times only when every required calendar can hold them.",
    true,
  ],
  [
    "canUseRoundRobinScheduling",
    "Round-robin scheduling",
    "Distribute meetings while the team keeps one booking record.",
    true,
  ],
  [
    "canUseRecurringEvents",
    "Recurring meetings",
    "State the cadence once and keep every occurrence together.",
    false,
  ],
  [
    "canUsePrivateLinks",
    "Private links",
    "Share specific terms without publishing another public event type.",
    false,
  ],
  ["canUseCustomRedirects", "Booking redirects", "Carry a confirmed booking to the next step.", false],
  [
    "canUseCustomBookingFields",
    "Custom booking questions",
    "Collect the terms needed before the meeting is agreed.",
    false,
  ],
  ["canUseBookingPayments", "Booking payments", "Collect payment as part of the booking terms.", false],
  [
    "canUseAdvancedEvents",
    "Advanced event terms",
    "Set buffers, limits, and seat rules around the meeting.",
    false,
  ],
] as const;

const capabilityCases = capabilities.flatMap(([capability, featureName, description, teamOnly]) =>
  (teamOnly ? [true] : [false, true]).map((teamScoped) => ({
    capability,
    description,
    featureName,
    teamScoped,
  }))
);

describe("event type update entitlement failures", () => {
  beforeEach(() => mocks.openUpgradePrompt.mockReset());

  it.each(capabilityCases)("opens exact plan copy for $capability in its event scope", ({
    capability,
    description,
    featureName,
    teamScoped,
  }) => {
    const { result } = renderHook(() => useEntitlementUpgrade());
    const context = getEventTypeUpdateUpgradeContext(
      teamScoped ? { id: 7, parentId: 41 } : null,
      "/event-types/17",
      "tabName=advanced&view=compact",
      41
    );
    const error = {
      data: {
        entitlement: { capability, effectivePlan: "FREE", kind: "capability" } satisfies EntitlementDenial,
      },
      message: "Forbidden",
    };
    const showExistingError = vi.fn();

    act(() =>
      handleEventTypeUpdateError({
        context,
        error,
        openFromError: result.current.openFromError,
        showExistingError,
      })
    );

    expect(mocks.openUpgradePrompt).toHaveBeenCalledOnce();
    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith({
      capability,
      description,
      featureName,
      ...(teamScoped ? { organizationId: 41 } : {}),
      requiredPlan: teamScoped ? "TEAM" : "PRO",
      resume: { kind: "returnToFeature" },
      returnTo: "/event-types/17?tabName=advanced&view=compact",
    });
    expect(showExistingError).not.toHaveBeenCalled();
  });

  it("opens the personal-limit prompt when unhiding through an update", () => {
    const { result } = renderHook(() => useEntitlementUpgrade());
    const error = {
      data: {
        entitlement: {
          currentCount: 2,
          effectivePlan: "FREE",
          kind: "limit",
          limit: 2,
          resource: "activePersonalEventTypes",
        } satisfies EntitlementDenial,
      },
      message: "Forbidden",
    };

    act(() =>
      handleEventTypeUpdateError({
        context: getEventTypeUpdateUpgradeContext(null, "/event-types/17", "tabName=setup", 41),
        error,
        openFromError: result.current.openFromError,
        showExistingError: vi.fn(),
      })
    );

    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Publish another way to meet without taking an existing link offline.",
        featureName: "Another event type",
        requiredPlan: "PRO",
        returnTo: "/event-types/17?tabName=setup",
      })
    );
  });

  it("uses only an event parent or matching top-level organization as Team billing authority", () => {
    expect(getEventTypeUpdateUpgradeContext({ id: 7, parentId: 41 }, "/event-types/17", "", 41)).toEqual({
      organizationId: 41,
      returnTo: "/event-types/17",
      teamId: 7,
    });
    expect(getEventTypeUpdateUpgradeContext({ id: 41, parentId: null }, "/event-types/17", "", 41)).toEqual({
      organizationId: 41,
      returnTo: "/event-types/17",
      teamId: 41,
    });
    expect(getEventTypeUpdateUpgradeContext({ id: 7, parentId: null }, "/event-types/17", "", 41)).toEqual({
      returnTo: "/event-types/17",
      teamId: 7,
    });
    expect(getEventTypeUpdateUpgradeContext(null, "/event-types/17", "", 41)).toEqual({
      returnTo: "/event-types/17",
    });
  });

  it("keeps ordinary forbidden errors on the existing path", () => {
    const { result } = renderHook(() => useEntitlementUpgrade());
    const showExistingError = vi.fn();
    const error = { data: { code: "FORBIDDEN" }, message: "Forbidden" };

    act(() =>
      handleEventTypeUpdateError({
        context: { returnTo: "/event-types/17?tabName=advanced" },
        error,
        openFromError: result.current.openFromError,
        showExistingError,
      })
    );

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
    expect(showExistingError).toHaveBeenCalledOnce();
  });
});
