import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it, vi } from "vitest";
import { PolarSeatService, type PolarSeatServiceDependencies } from "./PolarSeatService";

function setup() {
  const customerState = {
    activeBenefits: ["convenio-team" as const],
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
    currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
    customerId: "customer_team",
    effectiveAt: new Date("2026-07-15T12:00:00.000Z"),
    eventId: "reconcile_customer_team",
    externalCustomerId: "org:org_clerk",
    productId: "product_team_month",
    productMetadata: { billing_interval: "MONTH", plan_key: "TEAM" },
    seats: 3,
    status: "active" as const,
    subscriptionId: "subscription_team",
  };
  const gateway = {
    getCustomerState: vi.fn().mockResolvedValue(customerState),
    getSubscription: vi.fn().mockResolvedValue({
      externalCustomerId: "org:org_clerk",
      id: "subscription_team",
      seats: 3,
    }),
    updateSubscription: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    getOrganizationBilling: vi.fn().mockResolvedValue({
      externalCustomerId: "org:org_clerk",
      plan: "TEAM" as const,
      polarSubscriptionId: "subscription_team",
    }),
  };
  const projection = { projectCustomerState: vi.fn().mockResolvedValue({ applied: true }) };
  const dependencies: PolarSeatServiceDependencies = { gateway, projection, repository };
  return {
    customerState,
    gateway,
    projection,
    repository,
    service: new PolarSeatService(dependencies),
  };
}

describe("PolarSeatService", () => {
  it("updates Team seats before reconciling verified provider state", async () => {
    const ctx = setup();

    await ctx.service.syncAcceptedSeats({ desiredSeats: 3, organizationId: 41 });

    expect(ctx.gateway.updateSubscription).toHaveBeenCalledWith({
      id: "subscription_team",
      idempotencyKey: "billing:organization:41:seats:3",
      update: { seats: 3 },
    });
    expect(ctx.gateway.getCustomerState).toHaveBeenCalledWith("org:org_clerk");
    expect(ctx.projection.projectCustomerState).toHaveBeenCalledWith(ctx.customerState);
  });

  it.each([0, 51])("rejects an unsupported seat count of %s", async (desiredSeats) => {
    const ctx = setup();

    await expect(ctx.service.syncAcceptedSeats({ desiredSeats, organizationId: 41 })).rejects.toMatchObject({
      code: ErrorCode.EntitlementLimitExceeded,
    });
    expect(ctx.gateway.updateSubscription).not.toHaveBeenCalled();
  });

  it("requires an active Team subscription", async () => {
    const ctx = setup();
    ctx.repository.getOrganizationBilling.mockResolvedValue({
      externalCustomerId: "org:org_clerk",
      plan: "FREE",
      polarSubscriptionId: null,
    });

    await expect(
      ctx.service.syncAcceptedSeats({ desiredSeats: 2, organizationId: 41 })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(ctx.gateway.updateSubscription).not.toHaveBeenCalled();
  });

  it("refuses a provider subscription owned by another organization", async () => {
    const ctx = setup();
    ctx.gateway.getSubscription.mockResolvedValue({
      externalCustomerId: "org:someone_else",
      id: "subscription_team",
      seats: 3,
    });

    await expect(
      ctx.service.syncAcceptedSeats({ desiredSeats: 2, organizationId: 41 })
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    expect(ctx.gateway.updateSubscription).not.toHaveBeenCalled();
  });

  it("serializes concurrent seat updates for the same organization", async () => {
    const ctx = setup();
    let releaseFirst: (() => void) | undefined;
    ctx.gateway.updateSubscription.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        })
    );

    const first = ctx.service.syncAcceptedSeats({ desiredSeats: 2, organizationId: 41 });
    await vi.waitFor(() => expect(ctx.gateway.updateSubscription).toHaveBeenCalledTimes(1));
    const second = ctx.service.syncAcceptedSeats({ desiredSeats: 3, organizationId: 41 });
    await Promise.resolve();
    expect(ctx.gateway.updateSubscription).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.all([first, second]);
    expect(ctx.gateway.updateSubscription.mock.calls.map(([input]) => input.update)).toEqual([
      { seats: 2 },
      { seats: 3 },
    ]);
  });

  it("sanitizes provider failures and leaves the projection untouched", async () => {
    const ctx = setup();
    ctx.gateway.updateSubscription.mockRejectedValue(new Error("secret provider response"));

    await expect(
      ctx.service.syncAcceptedSeats({ desiredSeats: 2, organizationId: 41 })
    ).rejects.toMatchObject({
      code: ErrorCode.InternalServerError,
      message: "Polar seat synchronization failed",
    });
    expect(ctx.projection.projectCustomerState).not.toHaveBeenCalled();
  });
});
