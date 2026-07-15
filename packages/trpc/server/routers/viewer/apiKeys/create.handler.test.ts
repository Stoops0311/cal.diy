import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey } from "@calcom/features/billing/lib/plans";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it, vi } from "vitest";
import { type ApiKeyHandlerDependencies, createHandler } from "./create.handler";

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
  const create = vi.fn().mockResolvedValue("convenio_secret");
  const result: ApiKeyHandlerDependencies = {
    create,
    entitlements: {
      forOrganization: vi.fn().mockResolvedValue(snapshot),
      forUser: vi.fn().mockResolvedValue(snapshot),
    },
  };
  return { create, result };
}

const ctx = { user: { id: 7 } };

describe("API key entitlement gate", () => {
  it("rejects a direct Free mutation before persistence", async () => {
    const test = dependencies(PlanKey.FREE);

    await expect(
      createHandler({ ctx, dependencies: test.result, input: { neverExpires: true } })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(test.create).not.toHaveBeenCalled();
  });

  it("allows a personal Pro mutation", async () => {
    const test = dependencies(PlanKey.PRO);

    await expect(
      createHandler({ ctx, dependencies: test.result, input: { neverExpires: true } })
    ).resolves.toBe("convenio_secret");
    expect(test.result.entitlements.forUser).toHaveBeenCalledWith(7);
  });

  it("evaluates team API keys against the organization subscription", async () => {
    const test = dependencies(PlanKey.TEAM);

    await createHandler({ ctx, dependencies: test.result, input: { neverExpires: true, teamId: 41 } });
    expect(test.result.entitlements.forOrganization).toHaveBeenCalledWith(41);
  });
});
