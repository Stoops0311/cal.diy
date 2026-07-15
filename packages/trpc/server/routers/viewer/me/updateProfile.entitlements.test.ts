import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey } from "@calcom/features/billing/lib/plans";
import type { EvaluatedEntitlements } from "@calcom/features/billing/services/EntitlementService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it } from "vitest";
import { assertProfileUpdateEntitled } from "./updateProfile.handler";

function evaluation(plan: PlanKey): EvaluatedEntitlements {
  const subscription =
    plan === PlanKey.FREE
      ? null
      : {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          plan,
          status: BillingStatus.ACTIVE,
        };
  const snapshot = getEntitlements(subscription);
  return Object.freeze({
    ...snapshot,
    limits: Object.freeze({ ...snapshot.limits }),
    usage: Object.freeze({
      acceptedOrganizationMembers: 0,
      activePersonalEventTypes: 0,
      connectedCalendars: 0,
    }),
  });
}

describe("profile entitlements", () => {
  it("blocks a direct Free branding-removal mutation", () => {
    expect(() => assertProfileUpdateEntitled(evaluation(PlanKey.FREE), { hideBranding: true })).toThrowError(
      expect.objectContaining({ code: ErrorCode.EntitlementRequired })
    );
  });

  it("allows Pro branding removal and Free restoration", () => {
    expect(() => assertProfileUpdateEntitled(evaluation(PlanKey.PRO), { hideBranding: true })).not.toThrow();
    expect(() =>
      assertProfileUpdateEntitled(evaluation(PlanKey.FREE), { hideBranding: false })
    ).not.toThrow();
  });
});
