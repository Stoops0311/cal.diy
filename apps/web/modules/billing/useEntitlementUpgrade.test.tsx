import type { EntitlementDenial } from "@calcom/features/billing/lib/entitlementDenial";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openUpgradePrompt: vi.fn(),
  session: { user: { org: { id: 41, role: "OWNER" } } } as {
    user: { org?: { id: number; role: "OWNER" | "ADMIN" | "MEMBER" } };
  },
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: mocks.session }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("./UpgradePromptProvider", () => ({
  useUpgradePrompt: () => ({ openUpgradePrompt: mocks.openUpgradePrompt }),
}));

import { useEntitlementUpgrade } from "./useEntitlementUpgrade";

const personalCases = [
  ["activePersonalEventTypes", "active_personal_event_types"],
  ["canUseRecurringEvents", "use_recurring_events"],
  ["canCreateApiKeys", "create_api_keys"],
  ["connectedCalendars", "connected_calendars"],
  ["canRemoveBranding", "remove_branding"],
] as const;

function denialFor(gate: string): EntitlementDenial {
  if (gate === "activePersonalEventTypes" || gate === "connectedCalendars") {
    return { kind: "limit", resource: gate, currentCount: 1, effectivePlan: "FREE", limit: 1 };
  }
  return {
    kind: "capability",
    capability: gate as Extract<EntitlementDenial, { kind: "capability" }>["capability"],
    effectivePlan: "FREE",
  };
}

describe("useEntitlementUpgrade", () => {
  beforeEach(() => {
    mocks.openUpgradePrompt.mockReset();
    mocks.session = { user: { org: { id: 41, role: "OWNER" } } };
  });

  it.each(personalCases)("maps the %s denial to approved Pro copy", (gate, copyKey) => {
    const { result } = renderHook(() => useEntitlementUpgrade());

    expect(result.current.openFromDenial(denialFor(gate), { returnTo: "/settings/test" })).toBe(true);
    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith({
      capability: gate,
      description: `billing_upgrade_${copyKey}_description`,
      featureName: `billing_upgrade_${copyKey}_feature`,
      requiredPlan: "PRO",
      resume: { kind: "returnToFeature" },
      returnTo: "/settings/test",
    });
  });

  it.each([
    "canCreateTeamEvents",
    "canUseCollectiveScheduling",
    "canUseRoundRobinScheduling",
  ] as const)("requires explicit Team context for %s", (capability) => {
    const { result } = renderHook(() => useEntitlementUpgrade());
    const denial: EntitlementDenial = { kind: "capability", capability, effectivePlan: "FREE" };

    expect(result.current.openFromDenial(denial, { returnTo: "/event-types" })).toBe(false);
    expect(result.current.openFromDenial(denial, { returnTo: "/event-types", teamId: 99 })).toBe(false);
    expect(
      result.current.openFromDenial(denial, { organizationId: 41, returnTo: "/event-types", teamId: 7 })
    ).toBe(true);
    expect(mocks.openUpgradePrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({ capability, organizationId: 41, requiredPlan: "TEAM" })
    );
  });

  it("keeps a generic denial in Team when organization context is explicit", () => {
    mocks.session = { user: { org: { id: 77, role: "ADMIN" } } };
    const { result } = renderHook(() => useEntitlementUpgrade());
    const denial: EntitlementDenial = {
      kind: "capability",
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
    };

    expect(
      result.current.openFromDenial(denial, { organizationId: 77, returnTo: "/settings/developer/api-keys" })
    ).toBe(true);
    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 77, requiredPlan: "TEAM" })
    );
  });

  it("passes a Clerk-shaped organization candidate to the authoritative prompt provider", () => {
    mocks.session = { user: {} };
    const { result } = renderHook(() => useEntitlementUpgrade());
    const denial: EntitlementDenial = {
      currentCount: 1,
      effectivePlan: "FREE",
      kind: "limit",
      limit: 1,
      resource: "connectedCalendars",
    };

    expect(
      result.current.openFromDenial(denial, {
        organizationIdCandidate: 77,
        returnTo: "/apps/installation/accounts?slug=google-calendar",
      })
    ).toBe(true);
    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 77, requiredPlan: "TEAM" })
    );
  });

  it.each([
    ["OWNER", 99],
    ["MEMBER", 41],
  ] as const)("rejects a %s session for organization %i", (role, organizationId) => {
    mocks.session = { user: { org: { id: 41, role } } };
    const { result } = renderHook(() => useEntitlementUpgrade());
    const denial: EntitlementDenial = {
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
      kind: "capability",
    };

    expect(result.current.openFromDenial(denial, { organizationId, returnTo: "/settings/api-keys" })).toBe(
      false
    );
    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
  });

  it("opens only from an exact structured error denial", () => {
    const { result } = renderHook(() => useEntitlementUpgrade());
    const entitlement = {
      capability: "canCreateWebhooks",
      effectivePlan: "FREE",
      kind: "capability",
    };

    expect(result.current.openFromError({ data: { entitlement } }, { returnTo: "/settings/webhooks" })).toBe(
      true
    );
    for (const error of [
      { data: { code: "FORBIDDEN" }, message: "This requires a paid plan" },
      { data: { entitlement: { ...entitlement, provider: "polar" } } },
      new Error("Webhooks belong in Pro"),
      null,
    ]) {
      expect(result.current.openFromError(error, { returnTo: "/settings/webhooks" })).toBe(false);
    }
    expect(mocks.openUpgradePrompt).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown denials, unsafe returns, and invalid Team identifiers", () => {
    const { result } = renderHook(() => useEntitlementUpgrade());
    const unknown = { kind: "capability", capability: "unknown", effectivePlan: "FREE" };
    const valid: EntitlementDenial = {
      kind: "capability",
      capability: "canCreateApiKeys",
      effectivePlan: "FREE",
    };

    expect(result.current.openFromDenial(unknown as unknown as EntitlementDenial, { returnTo: "/x" })).toBe(
      false
    );
    expect(result.current.openFromDenial(valid, { returnTo: "https://evil.test" })).toBe(false);
    expect(result.current.openFromDenial(valid, { returnTo: "/x", teamId: 0 })).toBe(false);
    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
  });
});
