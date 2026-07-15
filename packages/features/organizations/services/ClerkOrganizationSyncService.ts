import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";

type ClerkOrganizationRole = "org:admin" | "org:member";

type ClerkOrganizationMembershipSnapshot = {
  active: boolean;
  clerkUserId: string;
  role: ClerkOrganizationRole;
};

type ClerkOrganizationSnapshot = {
  creatorClerkUserId: string | null;
  deleted: boolean;
  id: string;
  memberships: ClerkOrganizationMembershipSnapshot[];
  name: string;
  slug: string;
};

type ClerkOrganizationSyncResult = {
  acceptedSeats: number;
  archived: boolean;
  organizationId: number;
};

type LocalMember = {
  clerkUserId: string;
  email: string;
  id: number;
  username: string | null;
};

const roleMap = {
  "org:admin": MembershipRole.ADMIN,
  "org:member": MembershipRole.MEMBER,
} as const;

async function resolveSlug(
  tx: Prisma.TransactionClient,
  snapshot: ClerkOrganizationSnapshot,
  organizationId?: number
): Promise<string> {
  const collision = await tx.team.findFirst({
    where: {
      id: organizationId ? { not: organizationId } : undefined,
      isOrganization: true,
      parentId: null,
      slug: snapshot.slug,
    },
    select: { id: true },
  });

  if (!collision) return snapshot.slug;
  return `${snapshot.slug}-${snapshot.id.replace(/^org_/, "").slice(-8)}`;
}

async function upsertProfile(
  tx: Prisma.TransactionClient,
  organizationId: number,
  user: LocalMember
): Promise<void> {
  const baseUsername = user.username ?? user.email.split("@")[0];
  const usernameCollision = await tx.profile.findFirst({
    where: { organizationId, userId: { not: user.id }, username: baseUsername },
    select: { id: true },
  });
  const username = usernameCollision ? `${baseUsername}-${user.id}` : baseUsername;

  await tx.profile.upsert({
    where: { userId_organizationId: { organizationId, userId: user.id } },
    create: { organizationId, uid: crypto.randomUUID(), userId: user.id, username },
    update: { username },
  });
}

class ClerkOrganizationSyncService {
  async reconcileOrganization(snapshot: ClerkOrganizationSnapshot): Promise<ClerkOrganizationSyncResult> {
    return prisma.$transaction(async (tx) => {
      const existingOrganization = await tx.team.findUnique({
        where: { clerkOrganizationId: snapshot.id },
        select: { id: true },
      });

      if (snapshot.deleted) {
        if (!existingOrganization) {
          throw new ErrorWithCode(
            ErrorCode.ClerkOrganizationConflict,
            "Cannot archive an unmapped Clerk organization"
          );
        }

        await tx.team.update({
          where: { id: existingOrganization.id },
          data: { archivedAt: new Date() },
          select: { id: true },
        });
        const acceptedSeats = await tx.membership.count({
          where: { accepted: true, teamId: existingOrganization.id },
        });
        return { acceptedSeats, archived: true, organizationId: existingOrganization.id };
      }

      const activeSnapshots = snapshot.memberships.filter(({ active }) => active);
      const activeClerkUserIds = [...new Set(activeSnapshots.map(({ clerkUserId }) => clerkUserId))];
      const localMembers = await tx.user.findMany({
        where: { clerkUserId: { in: activeClerkUserIds } },
        select: { clerkUserId: true, email: true, id: true, username: true },
      });
      const localMemberByClerkId = new Map(
        localMembers.flatMap((user) => (user.clerkUserId ? [[user.clerkUserId, user] as const] : []))
      );
      const missingClerkUserId = activeClerkUserIds.find((id) => !localMemberByClerkId.has(id));
      if (missingClerkUserId) {
        throw new ErrorWithCode(
          ErrorCode.ClerkMemberLocalUserMissing,
          "An active Clerk organization member has no local user mapping",
          { clerkUserId: missingClerkUserId }
        );
      }

      const existingMemberships = existingOrganization
        ? await tx.membership.findMany({
            where: { teamId: existingOrganization.id },
            select: { accepted: true, role: true, userId: true },
          })
        : [];
      const existingOwnerIds = new Set(
        existingMemberships
          .filter(({ accepted, role }) => accepted && role === MembershipRole.OWNER)
          .map(({ userId }) => userId)
      );

      const acceptedMembers = activeSnapshots.map((membership) => {
        const user = localMemberByClerkId.get(membership.clerkUserId);
        if (!user) {
          throw new ErrorWithCode(
            ErrorCode.ClerkMemberLocalUserMissing,
            "An active Clerk organization member has no local user mapping"
          );
        }
        const isOwner =
          membership.clerkUserId === snapshot.creatorClerkUserId || existingOwnerIds.has(user.id);
        return { role: isOwner ? MembershipRole.OWNER : roleMap[membership.role], user };
      });
      if (!acceptedMembers.some(({ role }) => role === MembershipRole.OWNER)) {
        throw new ErrorWithCode(
          ErrorCode.ClerkOrganizationOwnerRequired,
          "An active organization must retain an accepted owner"
        );
      }

      const slug = await resolveSlug(tx, snapshot, existingOrganization?.id);
      const organization = existingOrganization
        ? await tx.team.update({
            where: { id: existingOrganization.id },
            data: { archivedAt: null, isOrganization: true, name: snapshot.name, slug },
            select: { id: true },
          })
        : await tx.team.create({
            data: {
              clerkOrganizationId: snapshot.id,
              isOrganization: true,
              name: snapshot.name,
              slug,
            },
            select: { id: true },
          });

      const acceptedUserIds = acceptedMembers.map(({ user }) => user.id);
      await tx.membership.updateMany({
        where: { teamId: organization.id, userId: { notIn: acceptedUserIds } },
        data: { accepted: false },
      });

      for (const { role, user } of acceptedMembers) {
        await tx.membership.upsert({
          where: { userId_teamId: { teamId: organization.id, userId: user.id } },
          create: { accepted: true, role, teamId: organization.id, userId: user.id },
          update: { accepted: true, role },
          select: { id: true },
        });
        await upsertProfile(tx, organization.id, user);
      }

      for (const membership of snapshot.memberships.filter(({ active }) => !active)) {
        const user = await tx.user.findUnique({
          where: { clerkUserId: membership.clerkUserId },
          select: { id: true },
        });
        if (!user) continue;
        await tx.membership.updateMany({
          where: { teamId: organization.id, userId: user.id },
          data: { accepted: false, role: roleMap[membership.role] },
        });
      }

      return { acceptedSeats: acceptedMembers.length, archived: false, organizationId: organization.id };
    });
  }
}

export { ClerkOrganizationSyncService };
export type { ClerkOrganizationMembershipSnapshot, ClerkOrganizationSnapshot, ClerkOrganizationSyncResult };
