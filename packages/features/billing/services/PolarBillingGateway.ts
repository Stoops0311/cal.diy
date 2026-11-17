import { getPolarClient, type PolarEnvironment, resolveConfiguredPolarBenefits } from "./PolarClient";
import type { PolarCustomerStateSnapshot } from "./PolarSubscriptionProjectionService";

type PolarCheckoutInput = {
  allowTrial: boolean;
  customerEmail: string;
  customerName: string | null;
  externalCustomerId: string;
  isBusinessCustomer?: boolean;
  maxSeats?: number;
  metadata: Record<string, string | number | boolean>;
  minSeats?: number;
  products: string[];
  returnUrl: string;
  seats?: number;
  successUrl: string;
};
type PolarSubscriptionUpdate = { cancelAtPeriodEnd: boolean } | { productId: string } | { seats: number };
type PolarBillingGateway = {
  createCheckout(input: PolarCheckoutInput): Promise<{ url: string }>;
  createCustomerSession(input: {
    externalCustomerId: string;
    returnUrl: string;
  }): Promise<{ customerPortalUrl: string }>;
  getCustomerState(externalCustomerId: string): Promise<PolarCustomerStateSnapshot>;
  getSubscription(id: string): Promise<{
    externalCustomerId: string | null;
    id: string;
    productMetadata: Record<string, unknown>;
    seats: number | null;
  }>;
  updateSubscription(input: {
    id: string;
    idempotencyKey: string;
    update: PolarSubscriptionUpdate;
  }): Promise<void>;
};

function subscriptionStatus(status: string): PolarCustomerStateSnapshot["status"] {
  if (
    status === "active" ||
    status === "canceled" ||
    status === "past_due" ||
    status === "trialing" ||
    status === "unpaid"
  ) {
    return status;
  }
  throw new Error("Polar returned an unsupported subscription status");
}

class PolarSdkBillingGateway implements PolarBillingGateway {
  private readonly client;

  constructor(
    private readonly environment: PolarEnvironment,
    private readonly now: () => Date = () => new Date()
  ) {
    this.client = getPolarClient(environment);
  }

  async createCheckout(input: PolarCheckoutInput): Promise<{ url: string }> {
    if (input.isBusinessCustomer) {
      const customer = await this.getOrCreateTeamCustomer(input);
      return this.client.checkouts.create({
        allowTrial: input.allowTrial,
        customerId: customer.id,
        isBusinessCustomer: true,
        maxSeats: input.maxSeats,
        metadata: input.metadata,
        minSeats: input.minSeats,
        products: input.products,
        returnUrl: input.returnUrl,
        seats: input.seats,
        successUrl: input.successUrl,
      });
    }
    return this.client.checkouts.create(input);
  }

  private async getOrCreateTeamCustomer(input: PolarCheckoutInput): Promise<{ id: string }> {
    let customer: Awaited<ReturnType<typeof this.client.customers.getExternal>>;
    try {
      customer = await this.client.customers.getExternal({ externalId: input.externalCustomerId });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "ResourceNotFound") throw error;
      try {
        customer = await this.client.customers.create({
          externalId: input.externalCustomerId,
          metadata: input.metadata,
          name: input.customerName,
          owner: { email: input.customerEmail, name: input.customerName },
          type: "team",
        });
      } catch (createError) {
        try {
          customer = await this.client.customers.getExternal({ externalId: input.externalCustomerId });
        } catch {
          throw createError;
        }
      }
    }
    if (customer.type !== "team") throw new Error("Polar customer type mismatch");
    return customer;
  }

  async createCustomerSession(input: {
    externalCustomerId: string;
    returnUrl: string;
  }): Promise<{ customerPortalUrl: string }> {
    const customer = await this.client.customers.getExternal({ externalId: input.externalCustomerId });
    if (customer.type === "individual") return this.client.customerSessions.create(input);

    const members = await this.client.members.listMembers({
      externalCustomerId: input.externalCustomerId,
      limit: 2,
      role: "owner",
    });
    if (members.result.items.length !== 1) throw new Error("Polar team customer owner mismatch");
    return this.client.customerSessions.create({
      ...input,
      memberId: members.result.items[0].id,
    });
  }

  async getSubscription(id: string): Promise<Awaited<ReturnType<PolarBillingGateway["getSubscription"]>>> {
    const subscription = await this.client.subscriptions.get({ id });
    return {
      externalCustomerId: subscription.customer.externalId ?? null,
      id: subscription.id,
      productMetadata: subscription.product.metadata,
      seats: subscription.seats ?? null,
    };
  }

  async updateSubscription(input: {
    id: string;
    idempotencyKey: string;
    update: PolarSubscriptionUpdate;
  }): Promise<void> {
    await this.client.subscriptions.update(
      { id: input.id, subscriptionUpdate: input.update },
      { headers: { "Idempotency-Key": input.idempotencyKey } }
    );
  }

  async getCustomerState(externalCustomerId: string): Promise<PolarCustomerStateSnapshot> {
    const state = await this.client.customers.getStateExternal({ externalId: externalCustomerId });
    if (state.externalId !== externalCustomerId) {
      throw new Error("Polar customer ownership mismatch");
    }
    if (state.activeSubscriptions.length > 1) {
      throw new Error("Polar returned multiple active subscriptions");
    }
    const active = state.activeSubscriptions[0];
    const subscription = active ? await this.client.subscriptions.get({ id: active.id }) : null;
    if (subscription && subscription.customer.externalId !== externalCustomerId) {
      throw new Error("Polar subscription ownership mismatch");
    }
    const effectiveAt = subscription?.modifiedAt ?? this.now();
    return {
      activeBenefits: resolveConfiguredPolarBenefits(
        state.grantedBenefits.map(({ benefitId }) => benefitId),
        this.environment
      ),
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      currentPeriodStart: subscription?.currentPeriodStart ?? null,
      customerId: state.id,
      effectiveAt,
      eventId: `reconcile:${state.id}:${effectiveAt.toISOString()}`,
      externalCustomerId,
      productId: subscription?.productId ?? null,
      productMetadata: subscription?.product.metadata ?? {},
      seats: subscription?.seats ?? 1,
      status: subscription ? subscriptionStatus(subscription.status) : "unpaid",
      subscriptionId: subscription?.id ?? null,
    };
  }
}

export { PolarSdkBillingGateway };
export type { PolarBillingGateway, PolarCheckoutInput, PolarSubscriptionUpdate };
