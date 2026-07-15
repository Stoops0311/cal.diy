import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it } from "vitest";
import { type ClerkOrganizationSnapshot, ClerkOrganizationSyncService } from "./ClerkOrganizationSyncService";

const createdOrganizationIds: number[] = [];
const createdExternalEventIds: string[] = [];
const createdUserIds: number[] = [];

const service = new ClerkOrganizationSyncService();

async function createUser(): Promise<{ clerkUserId: string; id: number }> {
  const suffix = crypto.randomUUID();
  const clerkUserId = `user_${suffix}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId,
      email: `clerk-org-${suffix}@example.com`,
      username: `clerk-org-${suffix}`,
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return { clerkUserId, id: user.id };
}

function snapshot(overrides: Partial<ClerkOrganizationSnapshot> = {}): ClerkOrganizationSnapshot {
  const suffix = crypto.randomUUID();
  return {
    creatorClerkUserId: null,
    deleted: false,
    id: `org_${suffix}`,
    memberships: [],
    name: `Organization ${suffix}`,
    slug: `organization-${suffix}`,
    ...overrides,
  };
}

afterEach(async () => {
  if (createdExternalEventIds.length > 0) {
    await prisma.externalWebhookEvent.deleteMany({
      where: { externalEventId: { in: createdExternalEventIds.splice(0) } },
    });
  }
  if (createdOrganizationIds.length > 0) {
    await prisma.team.deleteMany({ where: { id: { in: createdOrganizationIds.splice(0) } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  }
});

describe("Clerk organization persistence", () => {
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

describe("ClerkOrganizationSyncService", () => {
  it("creates an organization with accepted roles, profiles, and seat count", async () => {
    const owner = await createUser();
    const admin = await createUser();
    const member = await createUser();
    const pending = await createUser();
    const input = snapshot({
      creatorClerkUserId: owner.clerkUserId,
      memberships: [
        { active: true, clerkUserId: owner.clerkUserId, role: "org:admin" },
        { active: true, clerkUserId: admin.clerkUserId, role: "org:admin" },
        { active: true, clerkUserId: member.clerkUserId, role: "org:member" },
        { active: false, clerkUserId: pending.clerkUserId, role: "org:member" },
      ],
    });

    const result = await service.reconcileOrganization(input);
    createdOrganizationIds.push(result.organizationId);

    expect(result).toEqual({ acceptedSeats: 3, archived: false, organizationId: result.organizationId });
    await expect(
      prisma.membership.findMany({
        where: { teamId: result.organizationId },
        orderBy: { userId: "asc" },
        select: { accepted: true, role: true, userId: true },
      })
    ).resolves.toEqual([
      { accepted: true, role: "OWNER", userId: owner.id },
      { accepted: true, role: "ADMIN", userId: admin.id },
      { accepted: true, role: "MEMBER", userId: member.id },
    ]);
    await expect(prisma.profile.count({ where: { organizationId: result.organizationId } })).resolves.toBe(3);
  });

  it("preserves the owner while reconciling role changes and removals", async () => {
    const owner = await createUser();
    const member = await createUser();
    const organization = snapshot({
      creatorClerkUserId: owner.clerkUserId,
      memberships: [
        { active: true, clerkUserId: owner.clerkUserId, role: "org:admin" },
        { active: true, clerkUserId: member.clerkUserId, role: "org:admin" },
      ],
    });
    const created = await service.reconcileOrganization(organization);
    createdOrganizationIds.push(created.organizationId);

    const reconciled = await service.reconcileOrganization({
      ...organization,
      creatorClerkUserId: null,
      memberships: [
        { active: true, clerkUserId: owner.clerkUserId, role: "org:admin" },
        { active: false, clerkUserId: member.clerkUserId, role: "org:member" },
      ],
      name: "Renamed organization",
    });

    expect(reconciled.acceptedSeats).toBe(1);
    await expect(
      prisma.membership.findMany({
        where: { teamId: created.organizationId },
        orderBy: { userId: "asc" },
        select: { accepted: true, role: true },
      })
    ).resolves.toEqual([
      { accepted: true, role: "OWNER" },
      { accepted: false, role: "MEMBER" },
    ]);
  });

  it("rejects an active Clerk member without a mapped local user", async () => {
    await expect(
      service.reconcileOrganization(
        snapshot({
          creatorClerkUserId: "user_missing",
          memberships: [{ active: true, clerkUserId: "user_missing", role: "org:admin" }],
        })
      )
    ).rejects.toMatchObject({ code: "clerk_member_local_user_missing" });
  });

  it("refuses to create or reconcile an active organization without an owner", async () => {
    const admin = await createUser();

    await expect(
      service.reconcileOrganization(
        snapshot({
          memberships: [{ active: true, clerkUserId: admin.clerkUserId, role: "org:admin" }],
        })
      )
    ).rejects.toMatchObject({ code: "clerk_organization_owner_required" });
  });

  it("archives instead of deleting", async () => {
    const owner = await createUser();
    const organization = snapshot({
      creatorClerkUserId: owner.clerkUserId,
      memberships: [{ active: true, clerkUserId: owner.clerkUserId, role: "org:admin" }],
    });
    const created = await service.reconcileOrganization(organization);
    createdOrganizationIds.push(created.organizationId);

    const archived = await service.reconcileOrganization({ ...organization, deleted: true });

    expect(archived).toMatchObject({ archived: true, organizationId: created.organizationId });
    await expect(
      prisma.team.findUnique({ where: { id: created.organizationId }, select: { archivedAt: true } })
    ).resolves.toEqual({ archivedAt: expect.any(Date) });
  });

  it("uses a deterministic suffix when an organization slug already exists", async () => {
    const existing = await prisma.team.create({
      data: { isOrganization: true, name: "Existing organization", slug: "shared-slug" },
      select: { id: true },
    });
    createdOrganizationIds.push(existing.id);
    const owner = await createUser();
    const organization = snapshot({
      creatorClerkUserId: owner.clerkUserId,
      memberships: [{ active: true, clerkUserId: owner.clerkUserId, role: "org:admin" }],
      slug: "shared-slug",
    });

    const result = await service.reconcileOrganization(organization);
    createdOrganizationIds.push(result.organizationId);

    await expect(
      prisma.team.findUnique({ where: { id: result.organizationId }, select: { slug: true } })
    ).resolves.toMatchObject({ slug: expect.stringMatching(/^shared-slug-/) });
  });
});
