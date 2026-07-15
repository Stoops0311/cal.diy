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
  const dependencies: PolarWebhookServiceDependencies = {
    environment,
    projection: { projectCustomerState },
  };
  return { dependencies, projectCustomerState, service: new PolarWebhookService(dependencies) };
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
      productMetadata: { billing_interval: "MONTH", plan_key: "PRO", seats: 1 },
      seats: 1,
      status: "active",
      subscriptionId: "subscription_test",
    });
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
