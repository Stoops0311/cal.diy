import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey } from "@calcom/features/billing/lib/plans";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import { createHandler, type WebhookHandlerDependencies } from "./create.handler";

function dependencies(plan: PlanKey) {
  const snapshot = getEntitlements(
    plan === PlanKey.FREE
      ? null
      : {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          plan,
          status: BillingStatus.ACTIVE,
        }
  );
  const create = vi.fn().mockResolvedValue({ id: "webhook-one" });
  const result: WebhookHandlerDependencies = {
    create,
    entitlements: {
      forOrganization: vi.fn().mockResolvedValue(snapshot),
      forUser: vi.fn().mockResolvedValue(snapshot),
    },
  };
  return { create, result };
}

const ctx = { user: { id: 7, role: "USER" as const } };
const input = {
  active: true,
  eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED],
  payloadTemplate: null,
  subscriberUrl: "https://example.com/webhook",
};

describe("webhook entitlement gate", () => {
  it("rejects a direct Free mutation before persistence", async () => {
    const test = dependencies(PlanKey.FREE);

    await expect(createHandler({ ctx, dependencies: test.result, input })).rejects.toMatchObject({
      code: ErrorCode.EntitlementRequired,
    });
    expect(test.create).not.toHaveBeenCalled();
  });

  it("allows a personal Pro mutation", async () => {
    const test = dependencies(PlanKey.PRO);

    await createHandler({ ctx, dependencies: test.result, input });
    expect(test.create).toHaveBeenCalledWith(ctx, input);
    expect(test.result.entitlements.forUser).toHaveBeenCalledWith(7);
  });

  it("evaluates team webhooks against the organization subscription", async () => {
    const test = dependencies(PlanKey.TEAM);

    await createHandler({ ctx, dependencies: test.result, input: { ...input, teamId: 41 } });
    expect(test.result.entitlements.forOrganization).toHaveBeenCalledWith(41);
  });
});
