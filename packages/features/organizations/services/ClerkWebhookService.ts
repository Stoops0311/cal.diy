import { createHash } from "node:crypto";
import { getClerkBackendClient } from "@calcom/features/auth/lib/clerkClient";
import { PolarSeatService } from "@calcom/features/billing/services/PolarSeatService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { type ClerkOrganizationSnapshot, ClerkOrganizationSyncService } from "./ClerkOrganizationSyncService";
import type { OrganizationSeatBillingPort } from "./OrganizationSeatBillingPort";

type ClerkWebhookEvent = {
  data: {
    id?: string;
    organization?: { id: string };
    updated_at?: number;
  };
  type: string;
};

type ClerkWebhookInput = {
  event: ClerkWebhookEvent;
  eventId: string;
  rawBody: string;
};

type ClerkWebhookResult = "duplicate" | "ignored" | "processed";

type ClerkOrganizationSource = {
  getSnapshot(organizationId: string): Promise<ClerkOrganizationSnapshot>;
};

type ClerkOrganizationReconciler = Pick<ClerkOrganizationSyncService, "reconcileOrganization">;

type ClerkOrganizationState = { acceptedSeats: number; organizationId: number } | null;

type ClerkOrganizationRepository = {
  getOrganizationState(clerkOrganizationId: string): Promise<ClerkOrganizationState>;
};

type ClerkWebhookClaim = {
  effectiveAt: Date | null;
  eventId: string;
  payloadHash: string;
  type: string;
};

type ClerkWebhookEventStore = {
  claim(input: ClerkWebhookClaim): Promise<boolean>;
  markFailed(eventId: string, sanitizedError: string): Promise<void>;
  markSucceeded(eventId: string): Promise<void>;
};

type ClerkWebhookServiceDependencies = {
  eventStore?: ClerkWebhookEventStore;
  organizationRepository: ClerkOrganizationRepository;
  organizationSource: ClerkOrganizationSource;
  reconciler: ClerkOrganizationReconciler;
  seatBilling: OrganizationSeatBillingPort;
};

function payloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function effectiveAt(event: ClerkWebhookEvent): Date | null {
  if (typeof event.data.updated_at !== "number") return null;
  return new Date(event.data.updated_at);
}

function organizationId(event: ClerkWebhookEvent): string | null {
  if (event.type.startsWith("organizationMembership.")) return event.data.organization?.id ?? null;
  if (event.type.startsWith("organization.")) return event.data.id ?? null;
  return null;
}

function sanitizedError(error: unknown): string {
  if (error instanceof ErrorWithCode) return error.code;
  return "clerk_webhook_processing_failed";
}

class PrismaClerkWebhookEventStore implements ClerkWebhookEventStore {
  async claim(input: ClerkWebhookClaim): Promise<boolean> {
    try {
      await prisma.externalWebhookEvent.create({
        data: {
          effectiveAt: input.effectiveAt,
          externalEventId: input.eventId,
          payloadHash: input.payloadHash,
          provider: "CLERK",
          type: input.type,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }

    const existing = await prisma.externalWebhookEvent.findUniqueOrThrow({
      where: { provider_externalEventId: { provider: "CLERK", externalEventId: input.eventId } },
      select: { payloadHash: true, state: true },
    });
    if (existing.payloadHash !== input.payloadHash) {
      throw new ErrorWithCode(
        ErrorCode.ClerkWebhookPayloadConflict,
        "A Clerk event id was delivered with a different payload"
      );
    }
    if (existing.state !== "FAILED") return false;

    const retried = await prisma.externalWebhookEvent.updateMany({
      where: {
        externalEventId: input.eventId,
        payloadHash: input.payloadHash,
        provider: "CLERK",
        state: "FAILED",
      },
      data: {
        attempts: { increment: 1 },
        sanitizedError: null,
        state: "PROCESSING",
      },
    });
    return retried.count === 1;
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    await prisma.externalWebhookEvent.update({
      where: { provider_externalEventId: { provider: "CLERK", externalEventId: eventId } },
      data: { sanitizedError: error, state: "FAILED" },
      select: { id: true },
    });
  }

  async markSucceeded(eventId: string): Promise<void> {
    await prisma.externalWebhookEvent.update({
      where: { provider_externalEventId: { provider: "CLERK", externalEventId: eventId } },
      data: { processedAt: new Date(), sanitizedError: null, state: "SUCCEEDED" },
      select: { id: true },
    });
  }
}

class ClerkBackendOrganizationSource implements ClerkOrganizationSource {
  async getSnapshot(organizationId: string): Promise<ClerkOrganizationSnapshot> {
    const client = getClerkBackendClient();
    const organization = await client.organizations.getOrganization({ organizationId });
    const memberships: ClerkOrganizationSnapshot["memberships"] = [];
    let offset = 0;

    while (true) {
      const page = await client.organizations.getOrganizationMembershipList({
        limit: 100,
        offset,
        organizationId,
      });
      for (const membership of page.data) {
        const clerkUserId = membership.publicUserData?.userId;
        if (!clerkUserId || (membership.role !== "org:admin" && membership.role !== "org:member")) {
          throw new ErrorWithCode(
            ErrorCode.ClerkOrganizationConflict,
            "Clerk returned an unsupported organization membership"
          );
        }
        memberships.push({ active: true, clerkUserId, role: membership.role });
      }
      offset += page.data.length;
      if (offset >= page.totalCount || page.data.length === 0) break;
    }

    return {
      creatorClerkUserId: organization.createdBy ?? null,
      deleted: false,
      id: organization.id,
      memberships,
      name: organization.name,
      slug: organization.slug,
    };
  }
}

class PrismaClerkOrganizationRepository implements ClerkOrganizationRepository {
  async getOrganizationState(clerkOrganizationId: string): Promise<ClerkOrganizationState> {
    const organization = await prisma.team.findUnique({
      where: { clerkOrganizationId },
      select: {
        id: true,
        members: { where: { accepted: true }, select: { id: true } },
      },
    });
    if (!organization) return null;
    return { acceptedSeats: organization.members.length, organizationId: organization.id };
  }
}

class ClerkWebhookService {
  private readonly eventStore: ClerkWebhookEventStore;
  private readonly organizationRepository: ClerkOrganizationRepository;
  private readonly organizationSource: ClerkOrganizationSource;
  private readonly reconciler: ClerkOrganizationReconciler;
  private readonly seatBilling: OrganizationSeatBillingPort;

  constructor(dependencies?: ClerkWebhookServiceDependencies) {
    this.eventStore = dependencies?.eventStore ?? new PrismaClerkWebhookEventStore();
    this.organizationRepository =
      dependencies?.organizationRepository ?? new PrismaClerkOrganizationRepository();
    this.organizationSource = dependencies?.organizationSource ?? new ClerkBackendOrganizationSource();
    this.reconciler = dependencies?.reconciler ?? new ClerkOrganizationSyncService();
    this.seatBilling = dependencies?.seatBilling ?? new PolarSeatService();
  }

  async process(input: ClerkWebhookInput): Promise<ClerkWebhookResult> {
    const claimed = await this.eventStore.claim({
      effectiveAt: effectiveAt(input.event),
      eventId: input.eventId,
      payloadHash: payloadHash(input.rawBody),
      type: input.event.type,
    });
    if (!claimed) return "duplicate";

    try {
      const id = organizationId(input.event);
      if (!id) {
        await this.eventStore.markSucceeded(input.eventId);
        return "ignored";
      }

      let snapshot: ClerkOrganizationSnapshot;
      if (input.event.type === "organization.deleted") {
        snapshot = {
          creatorClerkUserId: null,
          deleted: true,
          id,
          memberships: [],
          name: "",
          slug: "",
        };
      } else {
        snapshot = await this.organizationSource.getSnapshot(id);
      }
      if (input.event.type.startsWith("organizationMembership.")) {
        const organization = await this.organizationRepository.getOrganizationState(id);
        const desiredSeats = snapshot.memberships.filter(({ active }) => active).length;
        if (organization && organization.acceptedSeats !== desiredSeats) {
          await this.seatBilling.syncAcceptedSeats({
            desiredSeats,
            organizationId: organization.organizationId,
          });
        }
      }
      await this.reconciler.reconcileOrganization(snapshot);
      await this.eventStore.markSucceeded(input.eventId);
      return "processed";
    } catch (error) {
      await this.eventStore.markFailed(input.eventId, sanitizedError(error));
      throw error;
    }
  }
}

export { ClerkBackendOrganizationSource, ClerkWebhookService };
export type { ClerkOrganizationSource, ClerkWebhookEvent, ClerkWebhookServiceDependencies };
