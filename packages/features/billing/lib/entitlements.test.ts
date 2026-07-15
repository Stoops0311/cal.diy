import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it } from "vitest";
import {
  assertEntitled,
  assertWithinLimit,
  getEntitlements,
  type SubscriptionEntitlementInput,
} from "./entitlements";
import { BillingStatus, PlanKey } from "./plans";

const now = new Date("2026-07-15T12:00:00.000Z");

function subscription(
  plan: PlanKey,
  status: BillingStatus = BillingStatus.ACTIVE,
  overrides: Partial<SubscriptionEntitlementInput> = {}
): SubscriptionEntitlementInput {
  return {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
    plan,
    status,
    ...overrides,
  };
}

describe("getEntitlements", () => {
  it.each([
    [PlanKey.FREE, 2, 1, false, false, true],
    [PlanKey.PRO, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, true, false, false],
    [PlanKey.TEAM, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, true, true, false],
  ] as const)("computes the %s capability matrix", (plan, events, calendars, canCreateApiKeys, canManageOrganizations, showBranding) => {
    const snapshot = getEntitlements(subscription(plan), now);

    expect(snapshot).toMatchObject({
      canCreateApiKeys,
      canManageOrganizations,
      effectivePlan: plan,
      limits: {
        activePersonalEventTypes: events,
        connectedCalendars: calendars,
      },
      showBranding,
    });
  });

  it("grants every personal paid capability to Pro", () => {
    expect(getEntitlements(subscription(PlanKey.PRO), now)).toMatchObject({
      canCreateApiKeys: true,
      canCreateWebhooks: true,
      canRemoveBranding: true,
      canUseAdvancedEvents: true,
      canUseBookingPayments: true,
      canUseCustomBookingFields: true,
      canUseCustomRedirects: true,
      canUsePrivateLinks: true,
      canUseRecurringEvents: true,
    });
  });

  it("grants Team organization and scheduling capabilities", () => {
    expect(getEntitlements(subscription(PlanKey.TEAM), now)).toMatchObject({
      canCreateTeamEvents: true,
      canInviteOrganizationMembers: true,
      canManageOrganizationRoles: true,
      canManageOrganizations: true,
      canReadBookingAudit: true,
      canUseCollectiveScheduling: true,
      canUseRoundRobinScheduling: true,
      limits: { acceptedOrganizationMembers: 50 },
    });
  });

  it.each([BillingStatus.TRIALING, BillingStatus.ACTIVE])("keeps %s subscriptions active", (status) => {
    expect(getEntitlements(subscription(PlanKey.PRO, status), now).effectivePlan).toBe(PlanKey.PRO);
  });

  it("keeps a period-end cancellation active until the period ends", () => {
    const active = subscription(PlanKey.PRO, BillingStatus.CANCELED, {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2026-07-16T12:00:00.000Z"),
    });

    expect(getEntitlements(active, now).effectivePlan).toBe(PlanKey.PRO);
    expect(getEntitlements(active, new Date("2026-07-16T12:00:00.001Z")).effectivePlan).toBe(PlanKey.FREE);
  });

  it("grants a seven-day past-due grace period", () => {
    const pastDue = subscription(PlanKey.PRO, BillingStatus.PAST_DUE, {
      currentPeriodEnd: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(getEntitlements(pastDue, new Date("2026-07-17T12:00:00.000Z")).effectivePlan).toBe(PlanKey.PRO);
    expect(getEntitlements(pastDue, new Date("2026-07-17T12:00:00.001Z")).effectivePlan).toBe(PlanKey.FREE);
  });

  it.each([BillingStatus.NONE, BillingStatus.UNPAID])("never grants paid access for %s", (status) => {
    expect(getEntitlements(subscription(PlanKey.TEAM, status), now).effectivePlan).toBe(PlanKey.FREE);
  });

  it("treats a missing subscription as Free", () => {
    expect(getEntitlements(null, now)).toMatchObject({ effectivePlan: PlanKey.FREE, showBranding: true });
  });
});

describe("entitlement assertions", () => {
  it("rejects a capability that the effective plan does not include", () => {
    const snapshot = getEntitlements(null, now);

    expect(() => assertEntitled(snapshot, "canCreateApiKeys")).toThrowError(
      expect.objectContaining({ code: ErrorCode.EntitlementRequired })
    );
  });

  it("allows a capability included in the effective plan", () => {
    const snapshot = getEntitlements(subscription(PlanKey.PRO), now);

    expect(() => assertEntitled(snapshot, "canCreateApiKeys")).not.toThrow();
  });

  it("blocks creating a resource at its plan limit without touching existing overages", () => {
    const snapshot = getEntitlements(null, now);

    expect(() => assertWithinLimit(snapshot, "activePersonalEventTypes", 2)).toThrowError(
      expect.objectContaining({ code: ErrorCode.EntitlementLimitExceeded })
    );
    expect(() => assertWithinLimit(snapshot, "activePersonalEventTypes", 1)).not.toThrow();
  });

  it("does not cap unlimited resources", () => {
    const snapshot = getEntitlements(subscription(PlanKey.PRO), now);

    expect(() => assertWithinLimit(snapshot, "connectedCalendars", 10_000)).not.toThrow();
  });
});
