import { ErrorCode } from "@calcom/lib/errorCodes";
import { describe, expect, it, vi } from "vitest";
import { PolarCheckoutService, type PolarCheckoutServiceDependencies } from "./PolarCheckoutService";

const environment = {
  POLAR_ACCESS_TOKEN: "polar_test_token",
  POLAR_PRO_BENEFIT_ID: "benefit_pro",
  POLAR_PRO_ANNUAL_PRODUCT_ID: "product_pro_year",
  POLAR_PRO_MONTHLY_PRODUCT_ID: "product_pro_month",
  POLAR_SERVER: "sandbox",
  POLAR_TEAM_ANNUAL_PRODUCT_ID: "product_team_year",
  POLAR_TEAM_BENEFIT_ID: "benefit_team",
  POLAR_TEAM_MONTHLY_PRODUCT_ID: "product_team_month",
  POLAR_WEBHOOK_SECRET: "polar_test_webhook_secret",
} as const;

function setup() {
  const userSubject = {
    customerEmail: "owner@example.com",
    customerName: "Owner",
    externalCustomerId: "user:user_clerk",
    subjectKey: "user:7",
    type: "USER" as const,
    userId: 7,
  };
  const organizationSubject = {
    acceptedSeats: 3,
    actorRole: "OWNER" as const,
    customerEmail: "owner@example.com",
    customerName: "Acme",
    externalCustomerId: "org:org_clerk",
    organizationId: 41,
    subjectKey: "organization:41",
    type: "ORGANIZATION" as const,
  };
  const customerState = {
    activeBenefits: ["convenio-pro" as const],
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
    currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
    customerId: "customer_1",
    effectiveAt: new Date("2026-07-15T12:00:00.000Z"),
    eventId: "reconcile_customer_1",
    externalCustomerId: userSubject.externalCustomerId,
    productId: "product_pro_month",
    productMetadata: { billing_interval: "MONTH", plan_key: "PRO" },
    seats: 1,
    status: "active" as const,
    subscriptionId: "subscription_1",
  };
  const gateway = {
    createCheckout: vi.fn().mockResolvedValue({ url: "https://sandbox.polar.sh/checkout/one" }),
    createCustomerSession: vi
      .fn()
      .mockResolvedValue({ customerPortalUrl: "https://sandbox.polar.sh/purchases/session" }),
    getCustomerState: vi.fn().mockResolvedValue(customerState),
    getSubscription: vi.fn().mockResolvedValue({
      externalCustomerId: userSubject.externalCustomerId,
      id: "subscription_1",
    }),
    updateSubscription: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    getBillingSubscription: vi.fn().mockResolvedValue({ polarSubscriptionId: "subscription_1" }),
    getOrganizationSubject: vi.fn().mockResolvedValue(organizationSubject),
    getUserSubject: vi.fn().mockResolvedValue(userSubject),
  };
  const projection = { projectCustomerState: vi.fn().mockResolvedValue({ applied: true }) };
  const dependencies: PolarCheckoutServiceDependencies = {
    environment,
    gateway,
    projection,
    repository,
    webAppUrl: "https://app.example.com",
  };
  return {
    customerState,
    dependencies,
    gateway,
    organizationSubject,
    projection,
    repository,
    service: new PolarCheckoutService(dependencies),
    userSubject,
  };
}

describe("PolarCheckoutService", () => {
  it.each([
    ["MONTH", "product_pro_month"],
    ["YEAR", "product_pro_year"],
  ] as const)("creates a personal Pro %s checkout without activating local access", async (interval, productId) => {
    const ctx = setup();

    await expect(ctx.service.createCheckout(7, { interval, plan: "PRO" })).resolves.toEqual({
      checkoutUrl: "https://sandbox.polar.sh/checkout/one",
    });

    expect(ctx.gateway.createCheckout).toHaveBeenCalledWith({
      allowTrial: true,
      customerEmail: "owner@example.com",
      customerName: "Owner",
      externalCustomerId: "user:user_clerk",
      metadata: {
        billing_interval: interval,
        plan_key: "PRO",
        subject_key: "user:7",
        subject_type: "USER",
      },
      products: [productId],
      returnUrl: "https://app.example.com/pricing",
      successUrl: "https://app.example.com/settings/billing?checkout_id={CHECKOUT_ID}",
    });
    expect(ctx.projection.projectCustomerState).not.toHaveBeenCalled();
  });

  it.each([
    ["MONTH", "product_team_month"],
    ["YEAR", "product_team_year"],
  ] as const)("creates an organization Team %s checkout for accepted seats", async (interval, productId) => {
    const ctx = setup();

    await ctx.service.createCheckout(7, { interval, organizationId: 41, plan: "TEAM" });

    expect(ctx.gateway.createCheckout).toHaveBeenCalledWith({
      allowTrial: true,
      customerEmail: "owner@example.com",
      customerName: "Acme",
      externalCustomerId: "org:org_clerk",
      isBusinessCustomer: true,
      maxSeats: 50,
      metadata: {
        billing_interval: interval,
        plan_key: "TEAM",
        seats: 3,
        subject_key: "organization:41",
        subject_type: "ORGANIZATION",
      },
      minSeats: 1,
      products: [productId],
      returnUrl: "https://app.example.com/pricing",
      seats: 3,
      successUrl: "https://app.example.com/settings/billing?checkout_id={CHECKOUT_ID}",
    });
  });

  it("rejects a personal plan for an organization subject", async () => {
    const ctx = setup();

    await expect(
      ctx.service.createCheckout(7, { interval: "MONTH", organizationId: 41, plan: "PRO" })
    ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
    expect(ctx.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it("requires an administrator for Team billing", async () => {
    const ctx = setup();
    ctx.repository.getOrganizationSubject.mockResolvedValue({
      ...ctx.organizationSubject,
      actorRole: "MEMBER",
    });

    await expect(
      ctx.service.createCheckout(7, { interval: "MONTH", organizationId: 41, plan: "TEAM" })
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    expect(ctx.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it("enforces the supported accepted-seat range", async () => {
    const ctx = setup();
    ctx.repository.getOrganizationSubject.mockResolvedValue({
      ...ctx.organizationSubject,
      acceptedSeats: 51,
    });

    await expect(
      ctx.service.createCheckout(7, { interval: "MONTH", organizationId: 41, plan: "TEAM" })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementLimitExceeded });
    expect(ctx.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it("creates a portal session only for the authorized subject", async () => {
    const ctx = setup();

    await expect(ctx.service.createPortalSession(7, { organizationId: 41 })).resolves.toEqual({
      portalUrl: "https://sandbox.polar.sh/purchases/session",
    });

    expect(ctx.gateway.createCustomerSession).toHaveBeenCalledWith({
      externalCustomerId: "org:org_clerk",
      returnUrl: "https://app.example.com/settings/billing",
    });
  });

  it("changes plans through Polar and reconciles verified provider state", async () => {
    const ctx = setup();

    await ctx.service.changePlan(7, { interval: "YEAR", plan: "PRO" });

    expect(ctx.gateway.getSubscription).toHaveBeenCalledWith("subscription_1");
    expect(ctx.gateway.updateSubscription).toHaveBeenCalledWith({
      id: "subscription_1",
      idempotencyKey: "billing:user:7:plan:product_pro_year",
      update: { productId: "product_pro_year" },
    });
    expect(ctx.gateway.getCustomerState).toHaveBeenCalledWith("user:user_clerk");
    expect(ctx.projection.projectCustomerState).toHaveBeenCalledWith(ctx.customerState);
  });

  it("refuses to mutate a provider subscription owned by another subject", async () => {
    const ctx = setup();
    ctx.gateway.getSubscription.mockResolvedValue({
      externalCustomerId: "user:someone_else",
      id: "subscription_1",
    });

    await expect(ctx.service.cancelAtPeriodEnd(7, {})).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    expect(ctx.gateway.updateSubscription).not.toHaveBeenCalled();
  });

  it("cancels at period end and reconciles instead of mutating local state optimistically", async () => {
    const ctx = setup();

    await ctx.service.cancelAtPeriodEnd(7, {});

    expect(ctx.gateway.updateSubscription).toHaveBeenCalledWith({
      id: "subscription_1",
      idempotencyKey: "billing:user:7:cancel-at-period-end",
      update: { cancelAtPeriodEnd: true },
    });
    expect(ctx.projection.projectCustomerState).toHaveBeenCalledTimes(1);
  });

  it("sanitizes provider failures", async () => {
    const ctx = setup();
    ctx.gateway.createCheckout.mockRejectedValue(new Error("secret provider response"));

    await expect(ctx.service.createCheckout(7, { interval: "MONTH", plan: "PRO" })).rejects.toMatchObject({
      code: ErrorCode.InternalServerError,
      message: "Polar subscription operation failed",
    });
  });
});
