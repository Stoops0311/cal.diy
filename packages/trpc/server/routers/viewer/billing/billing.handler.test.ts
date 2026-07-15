import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it, vi } from "vitest";
import {
  type BillingHandlerDependencies,
  cancelAtPeriodEndHandler,
  changePlanHandler,
  createCheckoutHandler,
  createPortalSessionHandler,
  getBillingHandler,
  reconcileBillingHandler,
  summaryBillingHandler,
} from "./billing.handler";

function setup() {
  const commands = {
    cancelAtPeriodEnd: vi.fn().mockResolvedValue(undefined),
    changePlan: vi.fn().mockResolvedValue(undefined),
    createCheckout: vi.fn().mockResolvedValue({ checkoutUrl: "https://sandbox.polar.sh/checkout/one" }),
    createPortalSession: vi
      .fn()
      .mockResolvedValue({ portalUrl: "https://sandbox.polar.sh/purchases/session" }),
    reconcile: vi.fn().mockResolvedValue(undefined),
  };
  const read = {
    getOrganizationProjection: vi.fn().mockResolvedValue({ subscription: null }),
    getOrganizationSummary: vi.fn().mockResolvedValue(null),
    getUserProjection: vi.fn().mockResolvedValue(null),
  };
  const rateLimit = vi.fn().mockResolvedValue(undefined);
  const dependencies: BillingHandlerDependencies = { commands, rateLimit, read };
  return { commands, dependencies, rateLimit, read };
}

const ctx = { user: { id: 7, profile: { organizationId: null } } };

describe("billing summary", () => {
  it("returns the personal Free summary without a projection", async () => {
    const test = setup();

    await expect(summaryBillingHandler({ ctx, dependencies: test.dependencies })).resolves.toEqual({
      canManageBilling: true,
      plan: "FREE",
      seats: null,
      status: "NONE",
      subject: { id: 7, type: "USER" },
    });
  });

  it("uses the effective personal plan from the Polar-backed projection", async () => {
    const test = setup();
    test.read.getUserProjection.mockResolvedValue({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
      interval: "MONTH",
      plan: "PRO",
      seatCount: 1,
      status: "ACTIVE",
    });

    await expect(summaryBillingHandler({ ctx, dependencies: test.dependencies })).resolves.toMatchObject({
      canManageBilling: true,
      plan: "PRO",
      seats: null,
      status: "ACTIVE",
      subject: { id: 7, type: "USER" },
    });
  });

  it("shows accepted Team usage to an ordinary member without management data", async () => {
    const test = setup();
    test.read.getOrganizationSummary.mockResolvedValue({
      acceptedSeats: 4,
      actorRole: "MEMBER",
      organizationId: 41,
      subscription: {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
        currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
        interval: "MONTH",
        plan: "TEAM",
        seatCount: 4,
        status: "ACTIVE",
      },
    });

    const result = await summaryBillingHandler({
      ctx: { user: { id: 7, profile: { organizationId: 41 } } },
      dependencies: test.dependencies,
    });

    expect(result).toEqual({
      canManageBilling: false,
      plan: "TEAM",
      seats: { accepted: 4, billed: null, limit: 50 },
      status: "ACTIVE",
      subject: { id: 41, type: "ORGANIZATION" },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /polar|provider|customer|subscriptionId|productId|credential/i
    );
  });

  it.each(["OWNER", "ADMIN"] as const)("allows an accepted %s to manage the plan", async (actorRole) => {
    const test = setup();
    test.read.getOrganizationSummary.mockResolvedValue({
      acceptedSeats: 4,
      actorRole,
      organizationId: 41,
      subscription: {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
        currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
        interval: "YEAR",
        plan: "TEAM",
        seatCount: 5,
        status: "ACTIVE",
      },
    });

    await expect(
      summaryBillingHandler({
        ctx: { user: { id: 7, profile: { organizationId: 41 } } },
        dependencies: test.dependencies,
      })
    ).resolves.toMatchObject({
      canManageBilling: true,
      seats: { accepted: 4, billed: 5, limit: 50 },
    });
  });

  it("falls back to the personal subject when the active organization is stale or unaccepted", async () => {
    const test = setup();
    test.read.getOrganizationSummary.mockResolvedValue(null);

    await expect(
      summaryBillingHandler({
        ctx: { user: { id: 7, profile: { organizationId: 41 } } },
        dependencies: test.dependencies,
      })
    ).resolves.toMatchObject({
      canManageBilling: true,
      plan: "FREE",
      subject: { id: 7, type: "USER" },
    });
    expect(test.read.getOrganizationSummary).toHaveBeenCalledWith({
      actorUserId: 7,
      organizationId: 41,
    });
    expect(test.read.getUserProjection).toHaveBeenCalledWith(7);
  });

  it("uses entitlement expiry rules instead of the raw Team plan", async () => {
    const test = setup();
    test.read.getOrganizationSummary.mockResolvedValue({
      acceptedSeats: 4,
      actorRole: "OWNER",
      organizationId: 41,
      subscription: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2020-01-01T00:00:00.000Z"),
        currentPeriodStart: new Date("2019-12-01T00:00:00.000Z"),
        interval: "MONTH",
        plan: "TEAM",
        seatCount: 4,
        status: "CANCELED",
      },
    });

    await expect(
      summaryBillingHandler({
        ctx: { user: { id: 7, profile: { organizationId: 41 } } },
        dependencies: test.dependencies,
      })
    ).resolves.toEqual({
      canManageBilling: true,
      plan: "FREE",
      seats: null,
      status: "CANCELED",
      subject: { id: 41, type: "ORGANIZATION" },
    });
  });
});

describe("billing handlers", () => {
  it("returns a sanitized Free projection when a personal subscription does not exist", async () => {
    const test = setup();

    await expect(getBillingHandler({ ctx, dependencies: test.dependencies, input: {} })).resolves.toEqual({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      currentPeriodStart: null,
      interval: null,
      plan: "FREE",
      seatCount: 1,
      status: "NONE",
      subject: { id: 7, type: "USER" },
    });
  });

  it("returns only public organization billing fields to an administrator", async () => {
    const test = setup();
    test.read.getOrganizationProjection.mockResolvedValue({
      subscription: {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
        currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
        interval: "MONTH",
        plan: "TEAM",
        seatCount: 3,
        status: "ACTIVE",
      },
    });

    await expect(
      getBillingHandler({ ctx, dependencies: test.dependencies, input: { organizationId: 41 } })
    ).resolves.toMatchObject({
      interval: "MONTH",
      plan: "TEAM",
      seatCount: 3,
      status: "ACTIVE",
      subject: { id: 41, type: "ORGANIZATION" },
    });
    expect(test.read.getOrganizationProjection).toHaveBeenCalledWith({
      actorUserId: 7,
      organizationId: 41,
    });
  });

  it("denies organization billing to a non-administrator", async () => {
    const test = setup();
    test.read.getOrganizationProjection.mockResolvedValue(null);

    await expect(
      getBillingHandler({ ctx, dependencies: test.dependencies, input: { organizationId: 41 } })
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
  });

  it("passes the authenticated actor and validated plan to checkout", async () => {
    const test = setup();

    await createCheckoutHandler({
      ctx,
      dependencies: test.dependencies,
      input: { interval: "YEAR", organizationId: 41, plan: "TEAM" },
    });

    expect(test.commands.createCheckout).toHaveBeenCalledWith(7, {
      interval: "YEAR",
      organizationId: 41,
      plan: "TEAM",
    });
  });

  it("rejects a checkout URL outside Polar", async () => {
    const test = setup();
    test.commands.createCheckout.mockResolvedValue({ checkoutUrl: "https://attacker.example/checkout" });

    await expect(
      createCheckoutHandler({
        ctx,
        dependencies: test.dependencies,
        input: { interval: "MONTH", plan: "PRO" },
      })
    ).rejects.toMatchObject({ code: ErrorCode.InternalServerError });
  });

  it("creates a subject-owned portal session and validates the provider URL", async () => {
    const test = setup();

    await expect(
      createPortalSessionHandler({
        ctx,
        dependencies: test.dependencies,
        input: { organizationId: 41 },
      })
    ).resolves.toEqual({ portalUrl: "https://sandbox.polar.sh/purchases/session" });
    expect(test.commands.createPortalSession).toHaveBeenCalledWith(7, { organizationId: 41 });
  });

  it("routes plan changes and period-end cancellation through the command service", async () => {
    const test = setup();

    await changePlanHandler({
      ctx,
      dependencies: test.dependencies,
      input: { interval: "MONTH", plan: "PRO" },
    });
    await cancelAtPeriodEndHandler({ ctx, dependencies: test.dependencies, input: {} });

    expect(test.commands.changePlan).toHaveBeenCalledWith(7, { interval: "MONTH", plan: "PRO" });
    expect(test.commands.cancelAtPeriodEnd).toHaveBeenCalledWith(7, {});
  });

  it("rate-limits reconciliation by authenticated subject", async () => {
    const test = setup();

    await reconcileBillingHandler({
      ctx,
      dependencies: test.dependencies,
      input: { organizationId: 41 },
    });

    expect(test.rateLimit).toHaveBeenCalledWith("billing-reconcile:7:organization:41");
    expect(test.commands.reconcile).toHaveBeenCalledWith(7, { organizationId: 41 });
  });
});
