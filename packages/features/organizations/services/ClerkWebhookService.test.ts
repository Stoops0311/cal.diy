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

function membershipEvent(
  organizationId: string,
  type:
    | "organizationMembership.created"
    | "organizationMembership.deleted"
    | "organizationMembership.updated" = "organizationMembership.updated"
): ClerkWebhookEvent {
  return {
    data: { id: `orgmem_${crypto.randomUUID()}`, organization: { id: organizationId } },
    type,
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
  const getOrganizationState = vi.fn().mockResolvedValue({ acceptedSeats: 1, organizationId: 1 });
  const syncAcceptedSeats = vi.fn().mockResolvedValue(undefined);
  const value: ClerkWebhookServiceDependencies = {
    organizationRepository: { getOrganizationState },
    organizationSource: { getSnapshot },
    reconciler: { reconcileOrganization },
    seatBilling: { syncAcceptedSeats },
  };
  return {
    getOrganizationState,
    getSnapshot,
    organizationSnapshot,
    reconcileOrganization,
    syncAcceptedSeats,
    value,
  };
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

  it("acknowledges a delayed event after its Clerk organization was deleted", async () => {
    const deps = dependencies();
    const notFound = new Error("missing organization");
    notFound.name = "ResourceNotFound";
    deps.getSnapshot.mockRejectedValue(notFound);
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await expect(
      process(service, eventId, organizationEvent("organization.updated", deps.organizationSnapshot.id))
    ).resolves.toBe("ignored");
    expect(deps.reconcileOrganization).not.toHaveBeenCalled();
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

  it("acknowledges deletion after the local organization is already gone", async () => {
    const deps = dependencies();
    deps.getOrganizationState.mockResolvedValue(null);
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await expect(
      process(service, eventId, organizationEvent("organization.deleted", deps.organizationSnapshot.id))
    ).resolves.toBe("ignored");
    expect(deps.reconcileOrganization).not.toHaveBeenCalled();
  });

  it("resolves the organization from membership events", async () => {
    const deps = dependencies();
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await process(service, eventId, membershipEvent(deps.organizationSnapshot.id));

    expect(deps.getSnapshot).toHaveBeenCalledWith(deps.organizationSnapshot.id);
  });

  it("updates Polar seats before reconciling an accepted membership", async () => {
    const deps = dependencies();
    deps.organizationSnapshot.memberships.push({
      active: true,
      clerkUserId: "user_member",
      role: "org:member",
    });
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await process(
      service,
      eventId,
      membershipEvent(deps.organizationSnapshot.id, "organizationMembership.created")
    );

    expect(deps.syncAcceptedSeats).toHaveBeenCalledWith({ desiredSeats: 2, organizationId: 1 });
    expect(deps.syncAcceptedSeats.mock.invocationCallOrder[0]).toBeLessThan(
      deps.reconcileOrganization.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("does not accept the membership locally when Polar rejects the seat increase", async () => {
    const deps = dependencies();
    deps.organizationSnapshot.memberships.push({
      active: true,
      clerkUserId: "user_member",
      role: "org:member",
    });
    deps.syncAcceptedSeats.mockRejectedValue(new Error("provider unavailable"));
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await expect(
      process(
        service,
        eventId,
        membershipEvent(deps.organizationSnapshot.id, "organizationMembership.created")
      )
    ).rejects.toThrow("provider unavailable");

    expect(deps.reconcileOrganization).not.toHaveBeenCalled();
  });

  it("decreases Polar seats before reconciling a removed membership", async () => {
    const deps = dependencies();
    deps.getOrganizationState.mockResolvedValue({ acceptedSeats: 2, organizationId: 1 });
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await process(
      service,
      eventId,
      membershipEvent(deps.organizationSnapshot.id, "organizationMembership.deleted")
    );

    expect(deps.syncAcceptedSeats).toHaveBeenCalledWith({ desiredSeats: 1, organizationId: 1 });
    expect(deps.syncAcceptedSeats.mock.invocationCallOrder[0]).toBeLessThan(
      deps.reconcileOrganization.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("acknowledges the final membership deletion while organization deletion is in flight", async () => {
    const deps = dependencies();
    deps.organizationSnapshot.memberships = [];
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await expect(
      process(
        service,
        eventId,
        membershipEvent(deps.organizationSnapshot.id, "organizationMembership.deleted")
      )
    ).resolves.toBe("ignored");
    expect(deps.syncAcceptedSeats).not.toHaveBeenCalled();
    expect(deps.reconcileOrganization).not.toHaveBeenCalled();
  });

  it("does not write Polar when a membership role changes without changing seat count", async () => {
    const deps = dependencies();
    const service = new ClerkWebhookService(deps.value);
    const eventId = `evt_${crypto.randomUUID()}`;

    await process(service, eventId, membershipEvent(deps.organizationSnapshot.id));

    expect(deps.syncAcceptedSeats).not.toHaveBeenCalled();
    expect(deps.reconcileOrganization).toHaveBeenCalledWith(deps.organizationSnapshot);
  });
});
