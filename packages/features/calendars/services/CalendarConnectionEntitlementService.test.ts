import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it, vi } from "vitest";
import { getEntitlements } from "../../billing/lib/entitlements";
import { BillingStatus, PlanKey } from "../../billing/lib/plans";
import { CalendarConnectionEntitlementService } from "./CalendarConnectionEntitlementService";

function evaluated(plan: "FREE" | "PRO", connectedCalendars: number) {
  const subscription =
    plan === "PRO"
      ? {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          plan: PlanKey.PRO,
          status: BillingStatus.ACTIVE,
        }
      : null;
  return {
    ...getEntitlements(subscription),
    usage: { acceptedOrganizationMembers: 0, activePersonalEventTypes: 0, connectedCalendars },
  };
}

describe("CalendarConnectionEntitlementService", () => {
  it("blocks a second Free calendar before the provider flow starts", async () => {
    const entitlements = { forUser: vi.fn().mockResolvedValue(evaluated("FREE", 1)) };
    const service = new CalendarConnectionEntitlementService(entitlements);

    await expect(service.assertCanConnectApp({ categories: ["calendar"], userId: 7 })).rejects.toMatchObject({
      code: ErrorCode.EntitlementLimitExceeded,
    });
  });

  it("allows the first Free calendar and unlimited Pro calendars", async () => {
    const entitlements = { forUser: vi.fn().mockResolvedValueOnce(evaluated("FREE", 0)) };
    const service = new CalendarConnectionEntitlementService(entitlements);

    await expect(
      service.assertCanConnectApp({ categories: ["calendar"], userId: 7 })
    ).resolves.toBeUndefined();
    entitlements.forUser.mockResolvedValueOnce(evaluated("PRO", 12));
    await expect(
      service.assertCanConnectApp({ categories: ["calendar"], userId: 7 })
    ).resolves.toBeUndefined();
  });

  it("does not evaluate non-calendar app installations", async () => {
    const entitlements = { forUser: vi.fn() };
    const service = new CalendarConnectionEntitlementService(entitlements);

    await expect(
      service.assertCanConnectApp({ categories: ["automation"], userId: 7 })
    ).resolves.toBeUndefined();
    expect(entitlements.forUser).not.toHaveBeenCalled();
  });
});
