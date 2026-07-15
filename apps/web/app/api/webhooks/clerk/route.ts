import {
  type ClerkWebhookEvent,
  ClerkWebhookService,
} from "@calcom/features/organizations/services/ClerkWebhookService";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";

function toServiceEvent(event: WebhookEvent): ClerkWebhookEvent {
  let organization: { id: string } | undefined;
  if ("organization" in event.data) organization = { id: event.data.organization.id };
  let updatedAt: number | undefined;
  if ("updated_at" in event.data) updatedAt = event.data.updated_at;

  return {
    data: { id: event.data.id, organization, updated_at: updatedAt },
    type: event.type,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(new NextRequest(request.clone()));
  } catch {
    return Response.json({ error: "Invalid Clerk webhook" }, { status: 400 });
  }

  const eventId = request.headers.get("svix-id")?.trim();
  if (!eventId) return Response.json({ error: "Invalid Clerk webhook" }, { status: 400 });

  const rawBody = await request.text();
  try {
    const status = await new ClerkWebhookService().process({
      event: toServiceEvent(event),
      eventId,
      rawBody,
    });
    return Response.json({ status });
  } catch {
    return Response.json({ error: "Clerk webhook processing failed" }, { status: 500 });
  }
}
