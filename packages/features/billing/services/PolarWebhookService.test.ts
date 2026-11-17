import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type PolarWebhookEvent,
  PolarWebhookService,
  type PolarWebhookServiceDependencies,
} from "./PolarWebhookService";

const eventIds: string[] = [];
const environment = {
  POLAR_ACCESS_TOKEN: "polar_test_token",
  POLAR_PRO_ANNUAL_PRODUCT_ID: "product_pro_year",
  POLAR_PRO_BENEFIT_ID: "benefit_pro",
  POLAR_PRO_MONTHLY_PRODUCT_ID: "product_pro_month",
  POLAR_SERVER: "sandbox",
  POLAR_TEAM_ANNUAL_PRODUCT_ID: "product_team_year",
  POLAR_TEAM_BENEFIT_ID: "benefit_team",
  POLAR_TEAM_MONTHLY_PRODUCT_ID: "product_team_month",
  POLAR_WEBHOOK_SECRET: "polar_test_webhook_secret",
};

function customerStateEvent(): PolarWebhookEvent {
  return {
    data: {
      activeSubscriptions: [
        {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
          id: "subscription_test",
          metadata: { billing_interval: "MONTH", plan_key: "PRO", seats: 1 },
          modifiedAt: new Date("2026-07-15T12:00:00.000Z"),
          productId: "product_pro_month",
          status: "active",
        },
      ],
      customerId: "customer_test",
      deletedAt: null,
      externalCustomerId: "user:user_test",
      grantedBenefitIds: ["benefit_pro"],
      modifiedAt: new Date("2026-07-15T12:00:00.000Z"),
      type: "individual",
    },
    timestamp: new Date("2026-07-15T12:00:00.000Z"),
    type: "customer.state_changed",
  };
}

function setup() {
  const projectCustomerState = vi.fn().mockResolvedValue({ applied: true, subscription: {} });
  const getSubscription = vi.fn().mockResolvedValue({
    externalCustomerId: "org:org_test",
    id: "subscription_test",
    productMetadata: { billing_interval: "MONTH", plan_key: "PRO" },
    seats: 4,
  });
  const dependencies: PolarWebhookServiceDependencies = {
    environment,
    projection: { projectCustomerState },
    subscriptionSource: { getSubscription },
  };
  return {
    dependencies,
    getSubscription,
    projectCustomerState,
    service: new PolarWebhookService(dependencies),
  };
}

async function process(service: PolarWebhookService, eventId: string, event: PolarWebhookEvent) {
  eventIds.push(eventId);
  return service.process({ event, eventId, rawBody: JSON.stringify({ eventId }) });
}

afterEach(async () => {
  await prisma.externalWebhookEvent.deleteMany({
    where: { externalEventId: { in: eventIds.splice(0) }, provider: "POLAR" },
  });
});

describe("PolarWebhookService", () => {
  it("projects a sanitized customer state", async () => {
    const test = setup();
    const eventId = `event_${crypto.randomUUID()}`;

    await expect(process(test.service, eventId, customerStateEvent())).resolves.toBe("processed");

    expect(test.projectCustomerState).toHaveBeenCalledWith({
      activeBenefits: ["convenio-pro"],
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
      customerId: "customer_test",
      effectiveAt: new Date("2026-07-15T12:00:00.000Z"),
      eventId,
      externalCustomerId: "user:user_test",
      productId: "product_pro_month",
      productMetadata: { billing_interval: "MONTH", plan_key: "PRO" },
      seats: 1,
      status: "active",
      subscriptionId: "subscription_test",
    });
  });

  it("uses the delivery timestamp for a newer subscription-free state", async () => {
    const test = setup();
    const eventId = `event_${crypto.randomUUID()}`;
    const event = customerStateEvent();
    if (!event.data) throw new Error("Expected customer state data");
    event.timestamp = new Date("2026-07-15T13:00:00.000Z");
    event.data.activeSubscriptions = [];
    event.data.grantedBenefitIds = [];
    event.data.modifiedAt = new Date("2026-07-15T11:30:00.000Z");

    await expect(process(test.service, eventId, event)).resolves.toBe("processed");

    expect(test.projectCustomerState).toHaveBeenCalledWith(
      expect.objectContaining({
        activeBenefits: [],
        effectiveAt: event.timestamp,
        productId: null,
        status: "unpaid",
        subscriptionId: null,
      })
    );
  });

  it("loads authoritative Team seats instead of trusting checkout metadata", async () => {
    const test = setup();
    const eventId = `event_${crypto.randomUUID()}`;
    const event = customerStateEvent();
    if (!event.data) throw new Error("Expected customer state data");
    event.data.type = "team";
    event.data.externalCustomerId = "org:org_test";
    event.data.grantedBenefitIds = ["benefit_team"];
    event.data.activeSubscriptions[0] = {
      ...event.data.activeSubscriptions[0],
      metadata: { billing_interval: "MONTH", plan_key: "TEAM", seats: 1 },
      productId: "product_team_month",
    };
    test.getSubscription.mockResolvedValue({
      externalCustomerId: "org:org_test",
      id: "subscription_test",
      productMetadata: { billing_interval: "MONTH", plan_key: "TEAM" },
      seats: 4,
    });

    await expect(process(test.service, eventId, event)).resolves.toBe("processed");

    expect(test.getSubscription).toHaveBeenCalledWith("subscription_test");
    expect(test.projectCustomerState).toHaveBeenCalledWith(
      expect.objectContaining({
        externalCustomerId: "org:org_test",
        seats: 4,
      })
    );
  });

  it("trusts product metadata after a monthly to annual switch left subscription metadata stale", async () => {
    const test = setup();
    const eventId = `event_${crypto.randomUUID()}`;
    const event = customerStateEvent();
    if (!event.data) throw new Error("Expected customer state data");
    event.data.activeSubscriptions[0] = {
      ...event.data.activeSubscriptions[0],
      productId: "product_pro_year",
    };
    test.getSubscription.mockResolvedValue({
      externalCustomerId: "user:user_test",
      id: "subscription_test",
      productMetadata: { billing_interval: "YEAR", plan_key: "PRO" },
      seats: null,
    });

    await expect(process(test.service, eventId, event)).resolves.toBe("processed");

    expect(test.projectCustomerState).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product_pro_year",
        productMetadata: { billing_interval: "YEAR", plan_key: "PRO" },
        seats: 1,
      })
    );
  });

  it("records and acknowledges unrelated verified events", async () => {
    const test = setup();
    const eventId = `event_${crypto.randomUUID()}`;

    await expect(
      process(test.service, eventId, {
        timestamp: new Date("2026-07-15T12:00:00.000Z"),
        type: "order.paid",
      })
    ).resolves.toBe("ignored");

    expect(test.projectCustomerState).not.toHaveBeenCalled();
  });

  it("acknowledges delayed state for a deleted local subject", async () => {
    const test = setup();
    test.projectCustomerState.mockRejectedValue(
      new ErrorWithCode(ErrorCode.PolarSubjectNotFound, "Polar customer subject is not mapped")
    );
    const eventId = `event_${crypto.randomUUID()}`;

    await expect(process(test.service, eventId, customerStateEvent())).resolves.toBe("ignored");
    await expect(
      prisma.externalWebhookEvent.findUniqueOrThrow({
        where: { provider_externalEventId: { externalEventId: eventId, provider: "POLAR" } },
        select: { sanitizedError: true, state: true },
      })
    ).resolves.toEqual({ sanitizedError: null, state: "SUCCEEDED" });
  });

  it("acknowledges delayed Team state after its provider subscription was deleted", async () => {
    const test = setup();
    const notFound = new Error("missing subscription");
    notFound.name = "ResourceNotFound";
    test.getSubscription.mockRejectedValue(notFound);
    const event = customerStateEvent();
    if (!event.data) throw new Error("Expected customer state data");
    event.data.type = "team";
    event.data.externalCustomerId = "org:org_test";
    const eventId = `event_${crypto.randomUUID()}`;

    await expect(process(test.service, eventId, event)).resolves.toBe("ignored");
    expect(test.projectCustomerState).not.toHaveBeenCalled();
  });

  it("acknowledges a terminal customer deletion snapshot without an external subject", async () => {
    const test = setup();
    const event = customerStateEvent();
    if (!event.data) throw new Error("Expected customer state data");
    Object.assign(event.data, {
      activeSubscriptions: [],
      deletedAt: new Date("2026-07-15T13:06:28.084Z"),
      externalCustomerId: null,
      grantedBenefitIds: [],
    });
    const eventId = `event_${crypto.randomUUID()}`;

    await expect(process(test.service, eventId, event)).resolves.toBe("ignored");
    expect(test.projectCustomerState).not.toHaveBeenCalled();
    await expect(
      prisma.externalWebhookEvent.findUniqueOrThrow({
        where: { provider_externalEventId: { externalEventId: eventId, provider: "POLAR" } },
        select: { sanitizedError: true, state: true },
      })
    ).resolves.toEqual({ sanitizedError: null, state: "SUCCEEDED" });
  });

  it("deduplicates a successfully processed event", async () => {
    const test = setup();
    const eventId = `event_${crypto.randomUUID()}`;
    const event = customerStateEvent();

    await process(test.service, eventId, event);
    await expect(process(test.service, eventId, event)).resolves.toBe("duplicate");

    expect(test.projectCustomerState).toHaveBeenCalledTimes(1);
  });

  it("retries a failed event without storing its thrown message", async () => {
    const test = setup();
    test.projectCustomerState.mockRejectedValueOnce(new Error("private billing payload"));
    const eventId = `event_${crypto.randomUUID()}`;

    await expect(process(test.service, eventId, customerStateEvent())).rejects.toThrow(
      "private billing payload"
    );
    await expect(process(test.service, eventId, customerStateEvent())).resolves.toBe("processed");

    await expect(
      prisma.externalWebhookEvent.findUniqueOrThrow({
        where: { provider_externalEventId: { externalEventId: eventId, provider: "POLAR" } },
        select: { attempts: true, sanitizedError: true, state: true },
      })
    ).resolves.toEqual({ attempts: 2, sanitizedError: null, state: "SUCCEEDED" });
  });

  it("rejects a changed payload under an existing event id", async () => {
    const test = setup();
    const eventId = `event_${crypto.randomUUID()}`;
    eventIds.push(eventId);
    await test.service.process({ event: customerStateEvent(), eventId, rawBody: "version-1" });

    await expect(
      test.service.process({ event: customerStateEvent(), eventId, rawBody: "version-2" })
    ).rejects.toMatchObject({ code: "polar_webhook_payload_conflict" });
  });
});
