import { createHash } from "node:crypto";
import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClerkWebhookEvent,
  ClerkWebhookService,
  type ClerkWebhookServiceDependencies,
} from "./ClerkWebhookService";

const createdEventIds: string[] = [];

function organizationEvent(
  type: "organization.created" | "organization.updated" | "organization.deleted",
  organizationId: string
): ClerkWebhookEvent {
  return {
    data: { id: organizationId, updated_at: 1_789_000_000_000 },
    type,
  };
}

function membershipEvent(organizationId: string): ClerkWebhookEvent {
  return {
    data: { id: `orgmem_${crypto.randomUUID()}`, organization: { id: organizationId } },
    type: "organizationMembership.updated",
  };
}

function dependencies() {
  const organizationSnapshot = {
    creatorClerkUserId: "user_owner",
    deleted: false,
    id: `org_${crypto.randomUUID()}`,
    memberships: [{ active: true, clerkUserId: "user_owner", role: "org:admin" as const }],
    name: "Convenio Team",
    slug: "convenio-team",
  };
  const getSnapshot = vi.fn().mockResolvedValue(organizationSnapshot);
  const reconcileOrganization = vi
    .fn()
    .mockResolvedValue({ acceptedSeats: 1, archived: false, organizationId: 1 });
  const value: ClerkWebhookServiceDependencies = {
    organizationSource: { getSnapshot },
    reconciler: { reconcileOrganization },
  };
  return { getSnapshot, organizationSnapshot, reconcileOrganization, value };
}

async function process(
  service: ClerkWebhookService,
  eventId: string,
  event: ClerkWebhookEvent,
  rawBody = '{"secret":"never-store-me"}'
) {
  createdEventIds.push(eventId);
  return service.process({ event, eventId, rawBody });
}

afterEach(async () => {
  await prisma.externalWebhookEvent.deleteMany({
    where: { provider: "CLERK", externalEventId: { in: createdEventIds.splice(0) } },
  });
});

describe("ClerkWebhookService", () => {
  it("reconciles a canonical snapshot and persists only a body hash", async () => {
    const deps = dependencies();
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;
    const rawBody = '{"secret":"never-store-me"}';

    await expect(
      process(
        service,
        eventId,
        organizationEvent("organization.updated", deps.organizationSnapshot.id),
        rawBody
      )
    ).resolves.toBe("processed");

    expect(deps.getSnapshot).toHaveBeenCalledWith(deps.organizationSnapshot.id);
    expect(deps.reconcileOrganization).toHaveBeenCalledWith(deps.organizationSnapshot);
    const persisted = await prisma.externalWebhookEvent.findUniqueOrThrow({
      where: { provider_externalEventId: { provider: "CLERK", externalEventId: eventId } },
    });
    expect(persisted).toMatchObject({
      attempts: 1,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
      sanitizedError: null,
      state: "SUCCEEDED",
      type: "organization.updated",
    });
    expect(JSON.stringify(persisted)).not.toContain("never-store-me");
  });

  it("deduplicates a successfully processed provider event", async () => {
    const deps = dependencies();
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;
    const event = organizationEvent("organization.created", deps.organizationSnapshot.id);

    await expect(process(service, eventId, event)).resolves.toBe("processed");
    await expect(process(service, eventId, event)).resolves.toBe("duplicate");

    expect(deps.reconcileOrganization).toHaveBeenCalledTimes(1);
  });

  it("retries a failed event without persisting the thrown message", async () => {
    const deps = dependencies();
    deps.reconcileOrganization
      .mockRejectedValueOnce(new Error("sensitive user payload"))
      .mockResolvedValueOnce({ acceptedSeats: 1, archived: false, organizationId: 1 });
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;
    const event = organizationEvent("organization.updated", deps.organizationSnapshot.id);

    await expect(process(service, eventId, event)).rejects.toThrow("sensitive user payload");
    await expect(process(service, eventId, event)).resolves.toBe("processed");

    await expect(
      prisma.externalWebhookEvent.findUniqueOrThrow({
        where: { provider_externalEventId: { provider: "CLERK", externalEventId: eventId } },
        select: { attempts: true, sanitizedError: true, state: true },
      })
    ).resolves.toEqual({ attempts: 2, sanitizedError: null, state: "SUCCEEDED" });
  });

  it("rejects a changed payload under an existing event id", async () => {
    const deps = dependencies();
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;
    const event = organizationEvent("organization.updated", deps.organizationSnapshot.id);

    await process(service, eventId, event, '{"version":1}');

    await expect(process(service, eventId, event, '{"version":2}')).rejects.toMatchObject({
      code: "clerk_webhook_payload_conflict",
    });
    expect(deps.reconcileOrganization).toHaveBeenCalledTimes(1);
  });

  it("archives a deleted organization without fetching it from Clerk", async () => {
    const deps = dependencies();
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await process(service, eventId, organizationEvent("organization.deleted", deps.organizationSnapshot.id));

    expect(deps.getSnapshot).not.toHaveBeenCalled();
    expect(deps.reconcileOrganization).toHaveBeenCalledWith({
      creatorClerkUserId: null,
      deleted: true,
      id: deps.organizationSnapshot.id,
      memberships: [],
      name: "",
      slug: "",
    });
  });

  it("resolves the organization from membership events", async () => {
    const deps = dependencies();
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await process(service, eventId, membershipEvent(deps.organizationSnapshot.id));

    expect(deps.getSnapshot).toHaveBeenCalledWith(deps.organizationSnapshot.id);
  });
});
