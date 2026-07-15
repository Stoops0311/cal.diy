import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey, type PlanKeyType } from "@calcom/features/billing/lib/plans";
import type { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it, type Mock, vi } from "vitest";
import { TeamEventEntitlementService } from "./TeamEventEntitlementService";

function evaluated(plan: PlanKeyType) {
  const subscription =
    plan === PlanKey.FREE
      ? null
      : {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          plan,
          status: BillingStatus.ACTIVE,
        };
  return {
    ...getEntitlements(subscription),
    usage: { acceptedOrganizationMembers: 0, activePersonalEventTypes: 0, connectedCalendars: 0 },
  };
}

function setup(plan: PlanKeyType) {
  const entitlements: { forOrganization: Mock<EntitlementService["forOrganization"]> } = {
    forOrganization: vi.fn().mockResolvedValue(evaluated(plan)),
  };
  return { entitlements, service: new TeamEventEntitlementService(entitlements) };
}

describe("TeamEventEntitlementService", () => {
  it("leaves personal event types active without evaluating an organization", async () => {
    const test = setup(PlanKey.FREE);

    await expect(test.service.isActive(null)).resolves.toBe(true);
    await expect(test.service.assertActive(null)).resolves.toBeUndefined();
    expect(test.entitlements.forOrganization).not.toHaveBeenCalled();
  });

  it.each([PlanKey.FREE, PlanKey.PRO])("marks a %s organization event plan-inactive", async (plan) => {
    const test = setup(plan);

    await expect(test.service.isActive(41)).resolves.toBe(false);
    await expect(test.service.assertActive(41)).rejects.toMatchObject({
      code: ErrorCode.EntitlementRequired,
    });
  });

  it("keeps Team organization events active", async () => {
    const test = setup(PlanKey.TEAM);

    await expect(test.service.isActive(41)).resolves.toBe(true);
    await expect(test.service.assertActive(41)).resolves.toBeUndefined();
  });

  it("treats an unbillable legacy team as plan-inactive", async () => {
    const test = setup(PlanKey.TEAM);
    test.entitlements.forOrganization.mockRejectedValue(
      new ErrorWithCode(ErrorCode.NotFound, "Organization entitlements not found")
    );

    await expect(test.service.isActive(41)).resolves.toBe(false);
    await expect(test.service.assertActive(41)).rejects.toMatchObject({
      code: ErrorCode.EntitlementRequired,
    });
  });
});
