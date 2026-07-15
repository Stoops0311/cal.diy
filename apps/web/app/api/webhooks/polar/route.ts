import { getPolarConfiguration } from "@calcom/features/billing/services/PolarClient";
import {
  type PolarWebhookEvent,
  PolarWebhookService,
} from "@calcom/features/billing/services/PolarWebhookService";
import {
  type VerifiedPolarEvent,
  validatePolarWebhook,
} from "@calcom/features/billing/services/PolarWebhookValidator";

type PolarSubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "unpaid";

function subscriptionStatus(status: string): PolarSubscriptionStatus {
  if (
    status === "active" ||
    status === "canceled" ||
    status === "past_due" ||
    status === "trialing" ||
    status === "unpaid"
  ) {
    return status;
  }
  throw new Error("Unsupported Polar subscription status");
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter((entry) => entry[1] !== null));
}

function toServiceEvent(event: VerifiedPolarEvent): PolarWebhookEvent {
  if (event.type !== "customer.state_changed") {
    return { timestamp: event.timestamp, type: event.type };
  }
  if (!event.data) throw new Error("Polar customer state is missing data");

  return {
    data: {
      activeSubscriptions: event.data.activeSubscriptions.map((subscription) => ({
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
        currentPeriodStart: subscription.currentPeriodStart,
        id: subscription.id,
        metadata: sanitizeMetadata(subscription.metadata),
        modifiedAt: subscription.modifiedAt,
        productId: subscription.productId,
        status: subscriptionStatus(subscription.status),
      })),
      customerId: event.data.id,
      deletedAt: event.data.deletedAt,
      externalCustomerId: event.data.externalId ?? null,
      grantedBenefitIds: event.data.grantedBenefits.map(({ benefitId }) => benefitId),
      modifiedAt: event.data.modifiedAt,
      type: event.data.type,
    },
    timestamp: event.timestamp,
    type: event.type,
  };
}

export async function POST(request: Request): Promise<Response> {
  const eventId = request.headers.get("webhook-id")?.trim();
  if (!eventId) return Response.json({ error: "Invalid Polar webhook" }, { status: 401 });

  let webhookSecret: string;
  try {
    webhookSecret = getPolarConfiguration().webhookSecret;
  } catch {
    return Response.json({ error: "Polar webhook is not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let verifiedEvent: VerifiedPolarEvent;
  try {
    verifiedEvent = validatePolarWebhook(rawBody, headers, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid Polar webhook" }, { status: 401 });
  }

  try {
    const status = await new PolarWebhookService().process({
      event: toServiceEvent(verifiedEvent),
      eventId,
      rawBody,
    });
    return Response.json({ status });
  } catch {
    return Response.json({ error: "Polar webhook processing failed" }, { status: 500 });
  }
}
