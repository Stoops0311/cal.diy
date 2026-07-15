import { describe, expect, it } from "vitest";
import type { SubscriptionEntitlementInput } from "../lib/entitlements";
import { BillingStatus, PlanKey } from "../lib/plans";
import {
  type EntitlementRepository,
  EntitlementService,
  type OrganizationEntitlementState,
  type UserEntitlementState,
} from "./EntitlementService";

const now = new Date("2026-07-15T12:00:00.000Z");

function subscription(plan: "PRO" | "TEAM", status: BillingStatus = BillingStatus.ACTIVE) {
  return {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
    plan,
    status,
  } satisfies SubscriptionEntitlementInput;
}

function setup(overrides?: {
  organization?: Partial<OrganizationEntitlementState>;
  user?: Partial<UserEntitlementState>;
}) {
  const user: UserEntitlementState = {
    activePersonalEventTypes: 2,
    connectedCalendars: 1,
    subscriptions: [],
    ...overrides?.user,
  };
  const organization: OrganizationEntitlementState = {
    acceptedOrganizationMembers: 3,
    subscription: null,
    ...overrides?.organization,
  };
  const repository: EntitlementRepository = {
    getOrganizationState: async () => organization,
    getUserState: async () => user,
  };
  return new EntitlementService(repository, () => now);
}

describe("EntitlementService", () => {
  it("returns a deeply immutable Free snapshot with current usage", async () => {
    const result = await setup().forUser(7);

    expect(result).toMatchObject({
      effectivePlan: PlanKey.FREE,
      limits: { activePersonalEventTypes: 2, connectedCalendars: 1 },
      usage: { activePersonalEventTypes: 2, connectedCalendars: 1 },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.limits)).toBe(true);
    expect(Object.isFrozen(result.usage)).toBe(true);
  });

  it("uses an active personal Pro subscription", async () => {
    const result = await setup({ user: { subscriptions: [subscription("PRO")] } }).forUser(7);

    expect(result).toMatchObject({ effectivePlan: PlanKey.PRO, canCreateApiKeys: true });
  });

  it("inherits Team capabilities from an accepted organization membership", async () => {
    const result = await setup({
      user: { subscriptions: [subscription("PRO"), subscription("TEAM")] },
    }).forUser(7);

    expect(result).toMatchObject({
      canCreateTeamEvents: true,
      canUseRoundRobinScheduling: true,
      effectivePlan: PlanKey.TEAM,
    });
  });

  it("ignores an expired Team membership instead of masking active Pro", async () => {
    const expiredTeam = {
      ...subscription("TEAM", BillingStatus.CANCELED),
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2026-07-14T12:00:00.000Z"),
    };
    const result = await setup({
      user: { subscriptions: [expiredTeam, subscription("PRO")] },
    }).forUser(7);

    expect(result.effectivePlan).toBe(PlanKey.PRO);
  });

  it("evaluates organization seats against its own Team subscription", async () => {
    const result = await setup({
      organization: { acceptedOrganizationMembers: 49, subscription: subscription("TEAM") },
    }).forOrganization(41);

    expect(result).toMatchObject({
      effectivePlan: PlanKey.TEAM,
      limits: { acceptedOrganizationMembers: 50 },
      usage: { acceptedOrganizationMembers: 49 },
    });
  });
});
