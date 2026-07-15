import { beforeEach, describe, expect, it, vi } from "vitest";

const { client } = vi.hoisted(() => ({
  client: {
    checkouts: { create: vi.fn() },
    customerSessions: { create: vi.fn() },
    customers: { create: vi.fn(), getExternal: vi.fn(), getStateExternal: vi.fn() },
    members: { listMembers: vi.fn() },
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
    client.customerSessions.create.mockResolvedValue({
      customerPortalUrl: "https://sandbox.polar.sh/purchases/session",
    });
    client.customers.getExternal.mockResolvedValue({ type: "individual" });
    client.customers.create.mockResolvedValue({ id: "customer_team", type: "team" });
    client.customers.getStateExternal.mockResolvedValue(customerState());
    client.members.listMembers.mockResolvedValue({ result: { items: [] } });
    client.subscriptions.get.mockResolvedValue(subscription());
    client.subscriptions.update.mockResolvedValue(undefined);
  });

  it("binds a team checkout to its existing customer instead of matching the owner email", async () => {
    client.customers.getExternal.mockResolvedValue({ id: "customer_team", type: "team" });
    const gateway = new PolarSdkBillingGateway(environment);
    const input = {
      allowTrial: true,
      customerEmail: "owner@example.com",
      customerName: "Acme",
      externalCustomerId: "org:org_clerk",
      isBusinessCustomer: true,
      metadata: { plan_key: "TEAM" },
      products: ["product_team_month"],
      returnUrl: "https://app.example.com/pricing",
      successUrl: "https://app.example.com/settings/billing",
    };

    await gateway.createCheckout(input);

    expect(client.customers.create).not.toHaveBeenCalled();
    expect(client.checkouts.create).toHaveBeenCalledWith({
      allowTrial: true,
      customerId: "customer_team",
      isBusinessCustomer: true,
      metadata: { plan_key: "TEAM" },
      products: ["product_team_month"],
      returnUrl: "https://app.example.com/pricing",
      successUrl: "https://app.example.com/settings/billing",
    });
  });

  it("creates a team customer with an owner before opening its first checkout", async () => {
    const notFound = new Error("missing");
    notFound.name = "ResourceNotFound";
    client.customers.getExternal.mockRejectedValueOnce(notFound);
    const gateway = new PolarSdkBillingGateway(environment);

    await gateway.createCheckout({
      allowTrial: true,
      customerEmail: "owner@example.com",
      customerName: "Acme",
      externalCustomerId: "org:org_clerk",
      isBusinessCustomer: true,
      metadata: { plan_key: "TEAM" },
      products: ["product_team_month"],
      returnUrl: "https://app.example.com/pricing",
      successUrl: "https://app.example.com/settings/billing",
    });

    expect(client.customers.create).toHaveBeenCalledWith({
      externalId: "org:org_clerk",
      metadata: { plan_key: "TEAM" },
      name: "Acme",
      owner: { email: "owner@example.com", name: "Acme" },
      type: "team",
    });
    expect(client.checkouts.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "customer_team" })
    );
  });

  it("does not turn Polar authorization failures into customer creation attempts", async () => {
    client.customers.getExternal.mockRejectedValue(new Error("forbidden"));
    const gateway = new PolarSdkBillingGateway(environment);

    await expect(
      gateway.createCheckout({
        allowTrial: true,
        customerEmail: "owner@example.com",
        customerName: "Acme",
        externalCustomerId: "org:org_clerk",
        isBusinessCustomer: true,
        metadata: { plan_key: "TEAM" },
        products: ["product_team_month"],
        returnUrl: "https://app.example.com/pricing",
        successUrl: "https://app.example.com/settings/billing",
      })
    ).rejects.toThrow("forbidden");
    expect(client.customers.create).not.toHaveBeenCalled();
    expect(client.checkouts.create).not.toHaveBeenCalled();
  });

  it("creates an individual customer session without a member", async () => {
    const gateway = new PolarSdkBillingGateway(environment);

    await gateway.createCustomerSession({
      externalCustomerId: "user:user_clerk",
      returnUrl: "https://app.example.com/settings/billing",
    });

    expect(client.members.listMembers).not.toHaveBeenCalled();
    expect(client.customerSessions.create).toHaveBeenCalledWith({
      externalCustomerId: "user:user_clerk",
      returnUrl: "https://app.example.com/settings/billing",
    });
  });

  it("creates a team customer session for its sole owner member", async () => {
    client.customers.getExternal.mockResolvedValue({ type: "team" });
    client.members.listMembers.mockResolvedValue({
      result: { items: [{ id: "member_owner" }] },
    });
    const gateway = new PolarSdkBillingGateway(environment);

    await gateway.createCustomerSession({
      externalCustomerId: "org:org_clerk",
      returnUrl: "https://app.example.com/settings/billing",
    });

    expect(client.members.listMembers).toHaveBeenCalledWith({
      externalCustomerId: "org:org_clerk",
      limit: 2,
      role: "owner",
    });
    expect(client.customerSessions.create).toHaveBeenCalledWith({
      externalCustomerId: "org:org_clerk",
      memberId: "member_owner",
      returnUrl: "https://app.example.com/settings/billing",
    });
  });

  it.each([
    { items: [] },
    { items: [{ id: "owner_1" }, { id: "owner_2" }] },
  ])("rejects a team portal session unless Polar has one owner", async ({ items }) => {
    client.customers.getExternal.mockResolvedValue({ type: "team" });
    client.members.listMembers.mockResolvedValue({ result: { items } });
    const gateway = new PolarSdkBillingGateway(environment);

    await expect(
      gateway.createCustomerSession({
        externalCustomerId: "org:org_clerk",
        returnUrl: "https://app.example.com/settings/billing",
      })
    ).rejects.toThrow("Polar team customer owner mismatch");
    expect(client.customerSessions.create).not.toHaveBeenCalled();
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

  it("timestamps a subscription-free reconciliation when the state is observed", async () => {
    const observedAt = new Date("2026-07-15T13:00:00.000Z");
    client.customers.getStateExternal.mockResolvedValue({
      ...customerState(),
      activeSubscriptions: [],
      grantedBenefits: [],
      modifiedAt: new Date("2026-07-15T11:30:00.000Z"),
    });
    const gateway = new PolarSdkBillingGateway(environment, () => observedAt);

    await expect(gateway.getCustomerState("user:user_clerk")).resolves.toMatchObject({
      activeBenefits: [],
      effectiveAt: observedAt,
      productId: null,
      status: "unpaid",
      subscriptionId: null,
    });
  });
});
