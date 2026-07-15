import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it } from "vitest";
import {
  type PolarCustomerStateSnapshot,
  PolarSubscriptionProjectionService,
} from "./PolarSubscriptionProjectionService";
import { type PolarWebhookEvent, PolarWebhookService } from "./PolarWebhookService";

const createdUserIds: number[] = [];
const createdOrganizationIds: number[] = [];
const webhookEventIds: string[] = [];

const polarEnvironment = {
  POLAR_ACCESS_TOKEN: "polar_test_token",
  POLAR_PRO_BENEFIT_ID: "benefit_pro",
  POLAR_PRO_ANNUAL_PRODUCT_ID: "product_pro_year",
  POLAR_PRO_MONTHLY_PRODUCT_ID: "product_pro_month",
  POLAR_SERVER: "sandbox",
  POLAR_TEAM_ANNUAL_PRODUCT_ID: "product_team_year",
  POLAR_TEAM_BENEFIT_ID: "benefit_team",
  POLAR_TEAM_MONTHLY_PRODUCT_ID: "product_team_month",
  POLAR_WEBHOOK_SECRET: "polar_test_webhook_secret",
};

const service = new PolarSubscriptionProjectionService(polarEnvironment);

function snapshot(overrides: Partial<PolarCustomerStateSnapshot> = {}): PolarCustomerStateSnapshot {
  return {
    activeBenefits: ["convenio-pro"],
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
    currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
    customerId: `customer_${crypto.randomUUID()}`,
    effectiveAt: new Date("2026-07-15T12:00:00.000Z"),
    eventId: `event_${crypto.randomUUID()}`,
    externalCustomerId: "user:missing",
    productId: "product_pro_month",
    productMetadata: { billing_interval: "MONTH", plan_key: "PRO" },
    seats: 1,
    status: "active",
    subscriptionId: `subscription_${crypto.randomUUID()}`,
    ...overrides,
  };
}

async function createMappedUser() {
  const clerkUserId = `user_${crypto.randomUUID()}`;
  const user = await prisma.user.create({
    data: { clerkUserId, email: `polar-${crypto.randomUUID()}@example.com` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return { clerkUserId, id: user.id };
}

async function createMappedOrganization() {
  const clerkOrganizationId = `org_${crypto.randomUUID()}`;
  const organization = await prisma.team.create({
    data: { clerkOrganizationId, isOrganization: true, name: `Polar ${crypto.randomUUID()}` },
    select: { id: true },
  });
  createdOrganizationIds.push(organization.id);
  return { clerkOrganizationId, id: organization.id };
}

describe("BillingSubscription persistence", () => {
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
    }
    if (createdOrganizationIds.length > 0) {
      await prisma.team.deleteMany({ where: { id: { in: createdOrganizationIds.splice(0) } } });
    }
    if (webhookEventIds.length > 0) {
      await prisma.externalWebhookEvent.deleteMany({
        where: { externalEventId: { in: webhookEventIds.splice(0) }, provider: "POLAR" },
      });
    }
  });

  it("stores one subscription for a user subject", async () => {
    const user = await prisma.user.create({
      data: { email: `polar-${crypto.randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const subscription = await prisma.billingSubscription.create({
      data: { subjectKey: `user:${user.id}`, userId: user.id },
      select: { plan: true, seatCount: true, status: true, subjectKey: true },
    });

    expect(subscription).toEqual({
      plan: "FREE",
      seatCount: 1,
      status: "NONE",
      subjectKey: `user:${user.id}`,
    });
  });

  it("stores one subscription for an organization subject", async () => {
    const organization = await prisma.team.create({
      data: { isOrganization: true, name: `Polar ${crypto.randomUUID()}` },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    await expect(
      prisma.billingSubscription.create({
        data: {
          organizationId: organization.id,
          seatCount: 50,
          subjectKey: `organization:${organization.id}`,
        },
        select: { organizationId: true, seatCount: true },
      })
    ).resolves.toEqual({ organizationId: organization.id, seatCount: 50 });
  });

  it("rejects a subscription with both subject relations", async () => {
    const user = await prisma.user.create({
      data: { email: `polar-${crypto.randomUUID()}@example.com` },
      select: { id: true },
    });
    const organization = await prisma.team.create({
      data: { isOrganization: true, name: `Polar ${crypto.randomUUID()}` },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    createdOrganizationIds.push(organization.id);

    await expect(
      prisma.billingSubscription.create({
        data: {
          organizationId: organization.id,
          subjectKey: `user:${user.id}`,
          userId: user.id,
        },
      })
    ).rejects.toThrow();
  });

  it("rejects subscriptions outside the supported seat range", async () => {
    const user = await prisma.user.create({
      data: { email: `polar-${crypto.randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await expect(
      prisma.billingSubscription.create({
        data: { seatCount: 51, subjectKey: `user:${user.id}`, userId: user.id },
      })
    ).rejects.toThrow();
  });
});

describe("PolarSubscriptionProjectionService", () => {
  it("projects an active Pro customer onto the mapped local user", async () => {
    const user = await createMappedUser();

    const result = await service.projectCustomerState(
      snapshot({ externalCustomerId: `user:${user.clerkUserId}` })
    );

    expect(result.applied).toBe(true);
    expect(result.subscription).toMatchObject({
      interval: "MONTH",
      plan: "PRO",
      seatCount: 1,
      status: "ACTIVE",
      subjectKey: `user:${user.id}`,
      userId: user.id,
    });
  });

  it("projects a trialing annual Team subscription with accepted seats", async () => {
    const organization = await createMappedOrganization();

    const result = await service.projectCustomerState(
      snapshot({
        activeBenefits: ["convenio-team"],
        externalCustomerId: `org:${organization.clerkOrganizationId}`,
        productId: "product_team_year",
        productMetadata: { billing_interval: "YEAR", plan_key: "TEAM" },
        seats: 3,
        status: "trialing",
      })
    );

    expect(result.subscription).toMatchObject({
      interval: "YEAR",
      organizationId: organization.id,
      plan: "TEAM",
      seatCount: 3,
      status: "TRIALING",
      subjectKey: `organization:${organization.id}`,
    });
  });

  it("projects a configured Team trial before Polar grants its custom benefit", async () => {
    const organization = await createMappedOrganization();

    const result = await service.projectCustomerState(
      snapshot({
        activeBenefits: [],
        externalCustomerId: `org:${organization.clerkOrganizationId}`,
        productId: "product_team_month",
        productMetadata: { billing_interval: "MONTH", plan_key: "TEAM" },
        seats: 1,
        status: "trialing",
      })
    );

    expect(result.subscription).toMatchObject({
      interval: "MONTH",
      organizationId: organization.id,
      plan: "TEAM",
      seatCount: 1,
      status: "TRIALING",
    });
  });

  it("does not let an older event overwrite newer state", async () => {
    const user = await createMappedUser();
    const externalCustomerId = `user:${user.clerkUserId}`;
    await service.projectCustomerState(
      snapshot({ effectiveAt: new Date("2026-07-15T12:00:00.000Z"), externalCustomerId })
    );

    const result = await service.projectCustomerState(
      snapshot({
        effectiveAt: new Date("2026-07-15T11:00:00.000Z"),
        externalCustomerId,
        status: "canceled",
      })
    );

    expect(result.applied).toBe(false);
    expect(result.subscription.status).toBe("ACTIVE");
  });

  it("preserves reconciled provider state when a delayed older webhook arrives", async () => {
    const user = await createMappedUser();
    const externalCustomerId = `user:${user.clerkUserId}`;
    const reconciledAt = new Date("2026-07-15T13:00:00.000Z");
    const delayedAt = new Date("2026-07-15T12:00:00.000Z");
    const eventId = `delayed_webhook_${crypto.randomUUID()}`;
    webhookEventIds.push(eventId);

    await service.projectCustomerState(
      snapshot({
        cancelAtPeriodEnd: true,
        effectiveAt: reconciledAt,
        externalCustomerId,
        status: "canceled",
      })
    );

    const webhook = new PolarWebhookService({
      environment: polarEnvironment,
      projection: service,
      subscriptionSource: { getSubscription: async () => ({ externalCustomerId, id: "unused", seats: 1 }) },
    });
    const delayedEvent: PolarWebhookEvent = {
      data: {
        activeSubscriptions: [
          {
            cancelAtPeriodEnd: false,
            currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
            currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
            id: "subscription_delayed",
            metadata: { billing_interval: "MONTH", plan_key: "PRO" },
            modifiedAt: delayedAt,
            productId: "product_pro_month",
            status: "active",
          },
        ],
        customerId: `customer_${user.id}`,
        deletedAt: null,
        externalCustomerId,
        grantedBenefitIds: ["benefit_pro"],
        modifiedAt: delayedAt,
        type: "individual",
      },
      timestamp: delayedAt,
      type: "customer.state_changed",
    };

    await expect(
      webhook.process({ event: delayedEvent, eventId, rawBody: `delayed:${eventId}` })
    ).resolves.toBe("processed");

    await expect(
      prisma.billingSubscription.findUniqueOrThrow({
        where: { subjectKey: `user:${user.id}` },
        select: { cancelAtPeriodEnd: true, latestEffectiveAt: true, status: true },
      })
    ).resolves.toEqual({
      cancelAtPeriodEnd: true,
      latestEffectiveAt: reconciledAt,
      status: "CANCELED",
    });
  });

  it("downgrades to Free when the paid benefit is revoked", async () => {
    const user = await createMappedUser();
    const externalCustomerId = `user:${user.clerkUserId}`;
    await service.projectCustomerState(
      snapshot({ effectiveAt: new Date("2026-07-15T12:00:00.000Z"), externalCustomerId })
    );

    const result = await service.projectCustomerState(
      snapshot({
        activeBenefits: [],
        effectiveAt: new Date("2026-07-15T13:00:00.000Z"),
        externalCustomerId,
        productId: null,
        status: "unpaid",
        subscriptionId: null,
      })
    );

    expect(result.subscription).toMatchObject({ interval: null, plan: "FREE", status: "NONE" });
  });

  it("retains a canceled paid plan while its benefit remains active", async () => {
    const user = await createMappedUser();

    const result = await service.projectCustomerState(
      snapshot({
        cancelAtPeriodEnd: true,
        externalCustomerId: `user:${user.clerkUserId}`,
        status: "canceled",
      })
    );

    expect(result.subscription).toMatchObject({ plan: "PRO", status: "CANCELED" });
  });

  it("rejects product metadata that disagrees with configuration", async () => {
    const user = await createMappedUser();

    await expect(
      service.projectCustomerState(
        snapshot({
          externalCustomerId: `user:${user.clerkUserId}`,
          productMetadata: { billing_interval: "YEAR", plan_key: "TEAM" },
        })
      )
    ).rejects.toMatchObject({ code: "polar_projection_conflict" });
  });

  it("rejects an unknown external subject", async () => {
    await expect(service.projectCustomerState(snapshot())).rejects.toMatchObject({
      code: "polar_subject_not_found",
    });
  });

  it("rejects Pro for organizations and Team for users", async () => {
    const user = await createMappedUser();
    const organization = await createMappedOrganization();

    await expect(
      service.projectCustomerState(
        snapshot({ externalCustomerId: `org:${organization.clerkOrganizationId}` })
      )
    ).rejects.toMatchObject({ code: "polar_projection_conflict" });
    await expect(
      service.projectCustomerState(
        snapshot({
          activeBenefits: ["convenio-team"],
          externalCustomerId: `user:${user.clerkUserId}`,
          productId: "product_team_month",
          productMetadata: { billing_interval: "MONTH", plan_key: "TEAM" },
        })
      )
    ).rejects.toMatchObject({ code: "polar_projection_conflict" });
  });
});
