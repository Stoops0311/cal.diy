import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey } from "@calcom/features/billing/lib/plans";
import type { EvaluatedEntitlements } from "@calcom/features/billing/services/EntitlementService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { prisma } from "@calcom/prisma";
import { SchedulingType } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import {
  assertEventTypeUpdateEntitled,
  type UpdateEntitlementDependencies,
  type UpdateEntitlementTarget,
  updateHandler,
} from "./update.handler";

function evaluation(plan: PlanKey, activePersonalEventTypes = 0): EvaluatedEntitlements {
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
    usage: Object.freeze({ acceptedOrganizationMembers: 0, activePersonalEventTypes, connectedCalendars: 0 }),
  });
}

const personalTarget: UpdateEntitlementTarget = { hidden: false, schedulingType: null, teamId: null };

describe("event type update entitlements", () => {
  it.each([
    [
      { id: 1, recurringEvent: { count: 2, dtstart: new Date(), freq: 1, interval: 1, tzid: "UTC" } },
      "canUseRecurringEvents",
    ],
    [{ id: 1, multiplePrivateLinks: ["private"] }, "canUsePrivateLinks"],
    [{ id: 1, successRedirectUrl: "https://example.com/done" }, "canUseCustomRedirects"],
    [
      { id: 1, customInputs: [{ label: "Company", required: false, type: "text" }] },
      "canUseCustomBookingFields",
    ],
    [{ id: 1, price: 1_000 }, "canUseBookingPayments"],
    [{ beforeEventBuffer: 15, id: 1 }, "canUseAdvancedEvents"],
    [{ id: 1, maxActiveBookingsPerBooker: 1 }, "canUseAdvancedEvents"],
  ])("blocks Free paid-only updates for %s", (input, capability) => {
    expect(() => assertEventTypeUpdateEntitled(evaluation(PlanKey.FREE), personalTarget, input)).toThrowError(
      expect.objectContaining({
        code: ErrorCode.EntitlementRequired,
        data: expect.objectContaining({ capability }),
      })
    );
  });

  it("blocks reactivating a hidden Free event while at the active limit", () => {
    expect(() =>
      assertEventTypeUpdateEntitled(
        evaluation(PlanKey.FREE, 2),
        { ...personalTarget, hidden: true },
        { hidden: false, id: 1 }
      )
    ).toThrowError(expect.objectContaining({ code: ErrorCode.EntitlementLimitExceeded }));
  });

  it("allows Pro personal advanced updates", () => {
    expect(() =>
      assertEventTypeUpdateEntitled(evaluation(PlanKey.PRO), personalTarget, {
        beforeEventBuffer: 15,
        id: 1,
        successRedirectUrl: "https://example.com/done",
      })
    ).not.toThrow();
  });

  it("requires Team when changing a shared event to round robin", () => {
    expect(() =>
      assertEventTypeUpdateEntitled(
        evaluation(PlanKey.PRO),
        { hidden: false, schedulingType: SchedulingType.COLLECTIVE, teamId: 41 },
        { id: 1, schedulingType: SchedulingType.ROUND_ROBIN }
      )
    ).toThrowError(expect.objectContaining({ code: ErrorCode.EntitlementRequired }));
  });

  it.each([
    [
      { recurringEvent: { count: 2, dtstart: new Date(), freq: 1, interval: 1, tzid: "UTC" } },
      "canUseRecurringEvents",
    ],
    [{ multiplePrivateLinks: ["private"] }, "canUsePrivateLinks"],
    [{ successRedirectUrl: "https://example.com/done" }, "canUseCustomRedirects"],
    [{ customInputs: [{ label: "Company", required: false, type: "text" }] }, "canUseCustomBookingFields"],
    [{ price: 1_000 }, "canUseBookingPayments"],
    [{ beforeEventBuffer: 15 }, "canUseAdvancedEvents"],
    [{ maxActiveBookingsPerBooker: 1 }, "canUseAdvancedEvents"],
  ])("rejects a direct authenticated Free update with %s before the existing update pipeline", async (paidInput, capability) => {
    const dependencies: UpdateEntitlementDependencies = {
      entitlements: {
        forOrganization: vi.fn().mockResolvedValue(evaluation(PlanKey.FREE)),
        forUser: vi.fn().mockResolvedValue(evaluation(PlanKey.FREE)),
      },
      getTarget: vi.fn().mockResolvedValue(personalTarget),
    };

    await expect(
      updateHandler({
        ctx: {
          prisma,
          user: {
            email: "person@example.com",
            id: 7,
            locale: "en",
            organizationId: null,
            profile: { id: 12 },
            userLevelSelectedCalendars: [],
            username: "person",
          },
        },
        dependencies,
        input: { id: 1, ...paidInput },
      })
    ).rejects.toMatchObject({
      code: ErrorCode.EntitlementRequired,
      data: expect.objectContaining({ capability }),
    });
  });
});
