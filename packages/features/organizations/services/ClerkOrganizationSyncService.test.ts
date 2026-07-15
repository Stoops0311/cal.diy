import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it } from "vitest";

const createdOrganizationIds: number[] = [];
const createdExternalEventIds: string[] = [];

describe("Clerk organization persistence", () => {
  afterEach(async () => {
    if (createdExternalEventIds.length > 0) {
      await prisma.externalWebhookEvent.deleteMany({
        where: { externalEventId: { in: createdExternalEventIds.splice(0) } },
      });
    }
    if (createdOrganizationIds.length > 0) {
      await prisma.team.deleteMany({ where: { id: { in: createdOrganizationIds.splice(0) } } });
    }
  });

  it("enforces one local organization per Clerk organization", async () => {
    const clerkOrganizationId = `org_${crypto.randomUUID()}`;
    const organization = await prisma.team.create({
      data: { clerkOrganizationId, isOrganization: true, name: "Clerk organization" },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    await expect(
      prisma.team.create({
        data: { clerkOrganizationId, isOrganization: true, name: "Duplicate Clerk organization" },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("archives an organization without deleting it", async () => {
    const archivedAt = new Date("2026-07-15T12:00:00.000Z");
    const organization = await prisma.team.create({
      data: {
        archivedAt,
        clerkOrganizationId: `org_${crypto.randomUUID()}`,
        isOrganization: true,
        name: "Archived Clerk organization",
      },
      select: { archivedAt: true, id: true },
    });
    createdOrganizationIds.push(organization.id);

    expect(organization.archivedAt).toEqual(archivedAt);
  });

  it("deduplicates a provider event id", async () => {
    const externalEventId = `evt_${crypto.randomUUID()}`;
    createdExternalEventIds.push(externalEventId);
    const event = {
      externalEventId,
      payloadHash: "a".repeat(64),
      provider: "CLERK" as const,
      type: "organization.created",
    };

    await prisma.externalWebhookEvent.create({ data: event });

    await expect(prisma.externalWebhookEvent.create({ data: event })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("allows the same external event id from different providers", async () => {
    const externalEventId = `evt_${crypto.randomUUID()}`;
    createdExternalEventIds.push(externalEventId);

    await prisma.externalWebhookEvent.createMany({
      data: [
        {
          externalEventId,
          payloadHash: "a".repeat(64),
          provider: "CLERK",
          type: "organization.created",
        },
        {
          externalEventId,
          payloadHash: "b".repeat(64),
          provider: "POLAR",
          type: "customer.state_changed",
        },
      ],
    });

    await expect(prisma.externalWebhookEvent.count({ where: { externalEventId } })).resolves.toBe(2);
  });
});
