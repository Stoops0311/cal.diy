import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey } from "@calcom/features/billing/lib/plans";
import type { EvaluatedEntitlements } from "@calcom/features/billing/services/EntitlementService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { prisma } from "@calcom/prisma";
import { SchedulingType } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import { type CreateEventTypeDependencies, createHandler } from "./create.handler";

function evaluation(plan: PlanKey, activePersonalEventTypes: number): EvaluatedEntitlements {
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

function setup(personal: EvaluatedEntitlements, organization = personal) {
  const create = vi.fn().mockResolvedValue({ eventType: { id: 1 } });
  const dependencies: CreateEventTypeDependencies = {
    create,
    entitlements: {
      forOrganization: vi.fn().mockResolvedValue(organization),
      forUser: vi.fn().mockResolvedValue(personal),
    },
  };
  return { create, dependencies };
}

const ctx = {
  prisma,
  user: {
    email: "person@example.com",
    id: 7,
    metadata: {},
    organization: { isOrgAdmin: false },
    organizationId: null,
    profile: { id: 12 },
    role: "USER" as const,
  },
};
const input = { hidden: false, length: 30, slug: "intro", title: "Intro" };

describe("event type creation entitlements", () => {
  it("blocks a third active personal event type on Free before writing", async () => {
    const test = setup(evaluation(PlanKey.FREE, 2));

    await expect(createHandler({ ctx, dependencies: test.dependencies, input })).rejects.toMatchObject({
      code: ErrorCode.EntitlementLimitExceeded,
    });
    expect(test.create).not.toHaveBeenCalled();
  });

  it("allows a second active personal event type on Free", async () => {
    const test = setup(evaluation(PlanKey.FREE, 1));

    await createHandler({ ctx, dependencies: test.dependencies, input });
    expect(test.create).toHaveBeenCalled();
  });

  it("allows hidden personal data above the active limit", async () => {
    const test = setup(evaluation(PlanKey.FREE, 2));

    await createHandler({ ctx, dependencies: test.dependencies, input: { ...input, hidden: true } });
    expect(test.create).toHaveBeenCalled();
  });

  it("requires Team for shared round-robin event types", async () => {
    const test = setup(evaluation(PlanKey.PRO, 0), evaluation(PlanKey.PRO, 0));

    await expect(
      createHandler({
        ctx,
        dependencies: test.dependencies,
        input: { ...input, schedulingType: SchedulingType.ROUND_ROBIN, teamId: 41 },
      })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(test.create).not.toHaveBeenCalled();
  });

  it("allows Team collective event types", async () => {
    const test = setup(evaluation(PlanKey.PRO, 0), evaluation(PlanKey.TEAM, 0));

    await createHandler({
      ctx,
      dependencies: test.dependencies,
      input: { ...input, schedulingType: SchedulingType.COLLECTIVE, teamId: 41 },
    });
    expect(test.create).toHaveBeenCalled();
  });
});
