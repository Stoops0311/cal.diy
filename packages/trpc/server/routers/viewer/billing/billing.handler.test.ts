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
    getUserProjection: vi.fn().mockResolvedValue(null),
  };
  const rateLimit = vi.fn().mockResolvedValue(undefined);
  const dependencies: BillingHandlerDependencies = { commands, rateLimit, read };
  return { commands, dependencies, rateLimit, read };
}

const ctx = { user: { id: 7 } };

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
