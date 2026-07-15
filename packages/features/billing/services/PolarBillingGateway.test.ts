import { beforeEach, describe, expect, it, vi } from "vitest";

const { client } = vi.hoisted(() => ({
  client: {
    checkouts: { create: vi.fn() },
    customerSessions: { create: vi.fn() },
    customers: { getStateExternal: vi.fn() },
    subscriptions: { get: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("./PolarClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./PolarClient")>()),
  getPolarClient: () => client,
}));

import { PolarSdkBillingGateway } from "./PolarBillingGateway";

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

function customerState(externalId = "user:user_clerk") {
  return {
    activeSubscriptions: [{ id: "subscription_1" }],
    createdAt: new Date("2026-07-15T11:00:00.000Z"),
    externalId,
    grantedBenefits: [{ benefitId: "benefit_pro" }],
    id: "customer_1",
    modifiedAt: new Date("2026-07-15T12:00:00.000Z"),
  };
}

function subscription() {
  return {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
    currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
    customer: { externalId: "user:user_clerk" },
    id: "subscription_1",
    modifiedAt: new Date("2026-07-15T12:00:00.000Z"),
    product: { metadata: { billing_interval: "MONTH", plan_key: "PRO" } },
    productId: "product_pro_month",
    seats: null,
    status: "active",
  };
}

describe("PolarSdkBillingGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.customers.getStateExternal.mockResolvedValue(customerState());
    client.subscriptions.get.mockResolvedValue(subscription());
    client.subscriptions.update.mockResolvedValue(undefined);
  });

  it("sends subscription mutations with an idempotency key", async () => {
    const gateway = new PolarSdkBillingGateway(environment);

    await gateway.updateSubscription({
      id: "subscription_1",
      idempotencyKey: "billing:user:7:cancel-at-period-end",
      update: { cancelAtPeriodEnd: true },
    });

    expect(client.subscriptions.update).toHaveBeenCalledWith(
      { id: "subscription_1", subscriptionUpdate: { cancelAtPeriodEnd: true } },
      { headers: { "Idempotency-Key": "billing:user:7:cancel-at-period-end" } }
    );
  });

  it("rejects customer state returned for another external subject", async () => {
    client.customers.getStateExternal.mockResolvedValue(customerState("user:someone_else"));
    const gateway = new PolarSdkBillingGateway(environment);

    await expect(gateway.getCustomerState("user:user_clerk")).rejects.toThrow(
      "Polar customer ownership mismatch"
    );
    expect(client.subscriptions.get).not.toHaveBeenCalled();
  });

  it("rejects an active subscription owned by another external subject", async () => {
    client.subscriptions.get.mockResolvedValue({
      ...subscription(),
      customer: { externalId: "user:someone_else" },
    });
    const gateway = new PolarSdkBillingGateway(environment);

    await expect(gateway.getCustomerState("user:user_clerk")).rejects.toThrow(
      "Polar subscription ownership mismatch"
    );
  });

  it("maps configured benefits and full subscription state for projection", async () => {
    const gateway = new PolarSdkBillingGateway(environment);

    await expect(gateway.getCustomerState("user:user_clerk")).resolves.toMatchObject({
      activeBenefits: ["convenio-pro"],
      customerId: "customer_1",
      externalCustomerId: "user:user_clerk",
      productId: "product_pro_month",
      seats: 1,
      status: "active",
      subscriptionId: "subscription_1",
    });
  });
});
