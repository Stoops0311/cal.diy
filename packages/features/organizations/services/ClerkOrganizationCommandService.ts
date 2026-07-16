import { getClerkBackendClient } from "@calcom/features/auth/lib/clerkClient";
import {
  assertEntitled,
  assertWithinLimit,
  type EntitlementCapability,
} from "@calcom/features/billing/lib/entitlements";
import { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import { PolarSeatService } from "@calcom/features/billing/services/PolarSeatService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type { MembershipRole } from "@calcom/prisma/enums";
import {
  type ClerkOrganizationSnapshot,
  type ClerkOrganizationSyncResult,
  ClerkOrganizationSyncService,
} from "./ClerkOrganizationSyncService";
import { ClerkBackendOrganizationSource, type ClerkOrganizationSource } from "./ClerkWebhookService";
import type { OrganizationSeatBillingPort } from "./OrganizationSeatBillingPort";

type ClerkRole = "org:admin" | "org:member";
type PendingOrganizationInvitation = {
  createdAt: Date;
  email: string;
  id: string;
  role: ClerkRole;
};
type OrganizationAccess = {
  actorRole: MembershipRole;
  archivedAt: Date | null;
  clerkOrganizationId: string;
};
type TargetMember = { accepted: boolean; clerkUserId: string; role: MembershipRole };

type ClerkOrganizationCommandGateway = {
  archiveOrganization(clerkOrganizationId: string): Promise<void>;
  changeMemberRole(input: {
    clerkOrganizationId: string;
    clerkUserId: string;
    role: ClerkRole;
  }): Promise<void>;
  createOrganization(input: { creatorClerkUserId: string; name: string; slug: string }): Promise<string>;
  inviteMember(input: {
    clerkOrganizationId: string;
    email: string;
    inviterClerkUserId: string;
    role: ClerkRole;
  }): Promise<void>;
  listPendingInvitations(clerkOrganizationId: string): Promise<PendingOrganizationInvitation[]>;
  removeMember(input: { clerkOrganizationId: string; clerkUserId: string }): Promise<void>;
  revokeInvitation(input: {
    clerkOrganizationId: string;
    invitationId: string;
    requestingClerkUserId: string;
  }): Promise<void>;
};

type OrganizationCommandRepository = {
  getActorClerkUserId(userId: number): Promise<string>;
  getOwnedOrganizationIds(userId: number): Promise<number[]>;
  getOrganizationAccess(input: { actorUserId: number; organizationId: number }): Promise<OrganizationAccess>;
  getTargetMember(input: { memberUserId: number; organizationId: number }): Promise<TargetMember>;
  ownerCount(organizationId: number): Promise<number>;
};

type OrganizationReconciler = Pick<ClerkOrganizationSyncService, "reconcileOrganization">;

type ClerkOrganizationCommandDependencies = {
  clerk: ClerkOrganizationCommandGateway;
  entitlements: Pick<EntitlementService, "forOrganization">;
  organizationSource: ClerkOrganizationSource;
  reconciler: OrganizationReconciler;
  repository: OrganizationCommandRepository;
  seatBilling: OrganizationSeatBillingPort;
};

class ClerkCommandGateway implements ClerkOrganizationCommandGateway {
  async createOrganization(input: {
    creatorClerkUserId: string;
    name: string;
    slug: string;
  }): Promise<string> {
    const organization = await getClerkBackendClient().organizations.createOrganization({
      createdBy: input.creatorClerkUserId,
      maxAllowedMemberships: 50,
      name: input.name,
      slug: input.slug,
    });
    return organization.id;
  }

  async inviteMember(input: {
    clerkOrganizationId: string;
    email: string;
    inviterClerkUserId: string;
    role: ClerkRole;
  }): Promise<void> {
    await getClerkBackendClient().organizations.createOrganizationInvitation({
      emailAddress: input.email,
      inviterUserId: input.inviterClerkUserId,
      organizationId: input.clerkOrganizationId,
      role: input.role,
    });
  }

  async listPendingInvitations(clerkOrganizationId: string): Promise<PendingOrganizationInvitation[]> {
    const response = await getClerkBackendClient().organizations.getOrganizationInvitationList({
      organizationId: clerkOrganizationId,
      status: ["pending"],
    });
    return response.data.map((invitation) => {
      if (invitation.role !== "org:admin" && invitation.role !== "org:member") throw providerFailure();
      return {
        createdAt: new Date(invitation.createdAt),
        email: invitation.emailAddress,
        id: invitation.id,
        role: invitation.role,
      };
    });
  }

  async revokeInvitation(input: {
    clerkOrganizationId: string;
    invitationId: string;
    requestingClerkUserId: string;
  }): Promise<void> {
    await getClerkBackendClient().organizations.revokeOrganizationInvitation({
      invitationId: input.invitationId,
      organizationId: input.clerkOrganizationId,
      requestingUserId: input.requestingClerkUserId,
    });
  }

  async changeMemberRole(input: {
    clerkOrganizationId: string;
    clerkUserId: string;
    role: ClerkRole;
  }): Promise<void> {
    await getClerkBackendClient().organizations.updateOrganizationMembership({
      organizationId: input.clerkOrganizationId,
      role: input.role,
      userId: input.clerkUserId,
    });
  }

  async removeMember(input: { clerkOrganizationId: string; clerkUserId: string }): Promise<void> {
    await getClerkBackendClient().organizations.deleteOrganizationMembership({
      organizationId: input.clerkOrganizationId,
      userId: input.clerkUserId,
    });
  }

  async archiveOrganization(clerkOrganizationId: string): Promise<void> {
    await getClerkBackendClient().organizations.deleteOrganization(clerkOrganizationId);
  }
}

class PrismaOrganizationCommandRepository implements OrganizationCommandRepository {
  async getActorClerkUserId(userId: number): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { clerkUserId: true } });
    if (!user?.clerkUserId) throw new ErrorWithCode(ErrorCode.Forbidden, "Clerk identity is required");
    return user.clerkUserId;
  }

  async getOrganizationAccess(input: {
    actorUserId: number;
    organizationId: number;
  }): Promise<OrganizationAccess> {
    const organization = await prisma.team.findUnique({
      where: { id: input.organizationId },
      select: {
        archivedAt: true,
        clerkOrganizationId: true,
        members: {
          where: { accepted: true, userId: input.actorUserId },
          select: { role: true },
        },
      },
    });
    const actorRole = organization?.members[0]?.role;
    if (!organization?.clerkOrganizationId || !actorRole) {
      throw new ErrorWithCode(ErrorCode.Forbidden, "Organization access denied");
    }
    return {
      actorRole,
      archivedAt: organization.archivedAt,
      clerkOrganizationId: organization.clerkOrganizationId,
    };
  }

  async getOwnedOrganizationIds(userId: number): Promise<number[]> {
    const memberships = await prisma.membership.findMany({
      where: {
        accepted: true,
        role: "OWNER",
        team: { archivedAt: null, isOrganization: true },
        userId,
      },
      select: { teamId: true },
    });
    return memberships.map(({ teamId }) => teamId);
  }

  async getTargetMember(input: { memberUserId: number; organizationId: number }): Promise<TargetMember> {
    const membership = await prisma.membership.findUnique({
      where: { userId_teamId: { teamId: input.organizationId, userId: input.memberUserId } },
      select: { accepted: true, role: true, user: { select: { clerkUserId: true } } },
    });
    if (!membership?.user.clerkUserId) {
      throw new ErrorWithCode(ErrorCode.ClerkMemberLocalUserMissing, "Member has no Clerk identity");
    }
    return { accepted: membership.accepted, clerkUserId: membership.user.clerkUserId, role: membership.role };
  }

  async ownerCount(organizationId: number): Promise<number> {
    return prisma.membership.count({ where: { accepted: true, role: "OWNER", teamId: organizationId } });
  }
}

function requireAdmin(access: OrganizationAccess): void {
  if (access.actorRole === "OWNER" || access.actorRole === "ADMIN") return;
  throw new ErrorWithCode(ErrorCode.Forbidden, "Organization administrator access is required");
}

function providerFailure(): ErrorWithCode {
  return new ErrorWithCode(ErrorCode.ClerkOrganizationConflict, "Clerk organization operation failed");
}

class ClerkOrganizationCommandService {
  private readonly dependencies: ClerkOrganizationCommandDependencies;
  private readonly transitions = new Map<number, Promise<unknown>>();

  constructor(dependencies?: ClerkOrganizationCommandDependencies) {
    this.dependencies =
      dependencies ??
      ({
        clerk: new ClerkCommandGateway(),
        entitlements: new EntitlementService(),
        organizationSource: new ClerkBackendOrganizationSource(),
        reconciler: new ClerkOrganizationSyncService(),
        repository: new PrismaOrganizationCommandRepository(),
        seatBilling: new PolarSeatService(),
      } satisfies ClerkOrganizationCommandDependencies);
  }

  async createOrganization(input: {
    actorUserId: number;
    name: string;
    slug: string;
  }): Promise<ClerkOrganizationSyncResult> {
    const ownedOrganizationIds = await this.dependencies.repository.getOwnedOrganizationIds(
      input.actorUserId
    );
    const ownedEntitlements = await Promise.all(
      ownedOrganizationIds.map((organizationId) =>
        this.dependencies.entitlements.forOrganization(organizationId)
      )
    );
    for (const entitlements of ownedEntitlements) {
      assertEntitled(entitlements, "canManageOrganizations");
    }

    const creatorClerkUserId = await this.dependencies.repository.getActorClerkUserId(input.actorUserId);
    let clerkOrganizationId: string;
    try {
      clerkOrganizationId = await this.dependencies.clerk.createOrganization({
        creatorClerkUserId,
        name: input.name,
        slug: input.slug,
      });
    } catch {
      throw providerFailure();
    }
    const snapshot = await this.dependencies.organizationSource.getSnapshot(clerkOrganizationId);
    return this.dependencies.reconciler.reconcileOrganization(snapshot);
  }

  async inviteMember(input: {
    actorUserId: number;
    email: string;
    organizationId: number;
    role: ClerkRole;
  }): Promise<void> {
    const access = await this.authorize(input.actorUserId, input.organizationId);
    await this.assertInvitationCapacity(input.organizationId);
    const normalizedEmail = input.email.trim().toLowerCase();
    const pendingInvitations = await this.loadPendingInvitations(access.clerkOrganizationId);
    if (pendingInvitations.some(({ email }) => email.trim().toLowerCase() === normalizedEmail)) {
      throw new ErrorWithCode(
        ErrorCode.ClerkOrganizationInvitationDuplicate,
        "An invitation is already pending for this email"
      );
    }
    const inviterClerkUserId = await this.dependencies.repository.getActorClerkUserId(input.actorUserId);
    try {
      await this.dependencies.clerk.inviteMember({
        clerkOrganizationId: access.clerkOrganizationId,
        email: input.email.trim(),
        inviterClerkUserId,
        role: input.role,
      });
    } catch {
      throw providerFailure();
    }
    await this.reconcile(access.clerkOrganizationId);
  }

  async listPendingInvitations(input: {
    actorUserId: number;
    organizationId: number;
  }): Promise<PendingOrganizationInvitation[]> {
    const access = await this.authorize(
      input.actorUserId,
      input.organizationId,
      "canInviteOrganizationMembers"
    );
    return this.loadPendingInvitations(access.clerkOrganizationId);
  }

  async revokeInvitation(input: {
    actorUserId: number;
    invitationId: string;
    organizationId: number;
  }): Promise<void> {
    return this.serialize(input.organizationId, async () => {
      const access = await this.authorize(
        input.actorUserId,
        input.organizationId,
        "canInviteOrganizationMembers"
      );
      await this.getPendingInvitation(access.clerkOrganizationId, input.invitationId);
      const requestingClerkUserId = await this.dependencies.repository.getActorClerkUserId(input.actorUserId);
      try {
        await this.dependencies.clerk.revokeInvitation({
          clerkOrganizationId: access.clerkOrganizationId,
          invitationId: input.invitationId,
          requestingClerkUserId,
        });
      } catch {
        throw providerFailure();
      }
    });
  }

  async resendInvitation(input: {
    actorUserId: number;
    invitationId: string;
    organizationId: number;
  }): Promise<void> {
    return this.serialize(input.organizationId, async () => {
      const access = await this.authorize(input.actorUserId, input.organizationId);
      await this.assertInvitationCapacity(input.organizationId);
      const invitation = await this.getPendingInvitation(access.clerkOrganizationId, input.invitationId);
      const requestingClerkUserId = await this.dependencies.repository.getActorClerkUserId(input.actorUserId);
      try {
        await this.dependencies.clerk.revokeInvitation({
          clerkOrganizationId: access.clerkOrganizationId,
          invitationId: invitation.id,
          requestingClerkUserId,
        });
        await this.dependencies.clerk.inviteMember({
          clerkOrganizationId: access.clerkOrganizationId,
          email: invitation.email,
          inviterClerkUserId: requestingClerkUserId,
          role: invitation.role,
        });
      } catch {
        throw providerFailure();
      }
    });
  }

  async changeMemberRole(input: {
    actorUserId: number;
    memberUserId: number;
    organizationId: number;
    role: ClerkRole;
  }): Promise<void> {
    const access = await this.authorize(
      input.actorUserId,
      input.organizationId,
      "canManageOrganizationRoles"
    );
    const target = await this.dependencies.repository.getTargetMember(input);
    await this.guardOwnerChange(input.organizationId, target);
    try {
      await this.dependencies.clerk.changeMemberRole({
        clerkOrganizationId: access.clerkOrganizationId,
        clerkUserId: target.clerkUserId,
        role: input.role,
      });
    } catch {
      const snapshot = await this.dependencies.organizationSource.getSnapshot(access.clerkOrganizationId);
      const applied = snapshot.memberships.some(
        ({ active, clerkUserId, role }) => active && clerkUserId === target.clerkUserId && role === input.role
      );
      if (!applied) throw providerFailure();
      await this.dependencies.reconciler.reconcileOrganization(snapshot);
      return;
    }
    await this.reconcile(access.clerkOrganizationId);
  }

  async removeMember(input: {
    actorUserId: number;
    memberUserId: number;
    organizationId: number;
  }): Promise<void> {
    return this.serialize(input.organizationId, async () => {
      const access = await this.authorize(input.actorUserId, input.organizationId, "canManageOrganizations");
      const target = await this.dependencies.repository.getTargetMember(input);
      await this.guardOwnerChange(input.organizationId, target);
      try {
        await this.dependencies.clerk.removeMember({
          clerkOrganizationId: access.clerkOrganizationId,
          clerkUserId: target.clerkUserId,
        });
      } catch {
        const snapshot = await this.dependencies.organizationSource.getSnapshot(access.clerkOrganizationId);
        if (
          snapshot.memberships.some(({ active, clerkUserId }) => active && clerkUserId === target.clerkUserId)
        ) {
          throw providerFailure();
        }
      }
      const snapshot = await this.dependencies.organizationSource.getSnapshot(access.clerkOrganizationId);
      await this.syncSeatsAndReconcile(input.organizationId, snapshot);
    });
  }

  async activateAcceptedMember(input: {
    organizationId: number;
    snapshot: ClerkOrganizationSnapshot;
  }): Promise<void> {
    return this.serialize(input.organizationId, async () => {
      const entitlements = await this.dependencies.entitlements.forOrganization(input.organizationId);
      assertEntitled(entitlements, "canInviteOrganizationMembers");
      const desiredSeats = input.snapshot.memberships.filter(({ active }) => active).length;
      assertWithinLimit(entitlements, "acceptedOrganizationMembers", Math.max(0, desiredSeats - 1));
      await this.syncSeatsAndReconcile(input.organizationId, input.snapshot);
    });
  }

  async archiveOrganization(input: { actorUserId: number; organizationId: number }): Promise<void> {
    const access = await this.authorize(input.actorUserId, input.organizationId);
    if (access.actorRole !== "OWNER") throw new ErrorWithCode(ErrorCode.Forbidden, "Owner access required");
    try {
      await this.dependencies.clerk.archiveOrganization(access.clerkOrganizationId);
    } catch {
      throw providerFailure();
    }
    await this.dependencies.reconciler.reconcileOrganization({
      creatorClerkUserId: null,
      deleted: true,
      id: access.clerkOrganizationId,
      memberships: [],
      name: "",
      slug: "",
    });
  }

  private async authorize(
    actorUserId: number,
    organizationId: number,
    capability?: EntitlementCapability
  ): Promise<OrganizationAccess> {
    const access = await this.dependencies.repository.getOrganizationAccess({ actorUserId, organizationId });
    if (access.archivedAt) {
      throw new ErrorWithCode(ErrorCode.ClerkOrganizationConflict, "Archived organizations are read-only");
    }
    requireAdmin(access);
    if (capability) {
      assertEntitled(await this.dependencies.entitlements.forOrganization(organizationId), capability);
    }
    return access;
  }

  private async guardOwnerChange(organizationId: number, target: TargetMember): Promise<void> {
    if (target.role !== "OWNER" || !target.accepted) return;
    if ((await this.dependencies.repository.ownerCount(organizationId)) > 1) return;
    throw new ErrorWithCode(
      ErrorCode.ClerkOrganizationOwnerRequired,
      "The last organization owner cannot be changed or removed"
    );
  }

  private async assertInvitationCapacity(organizationId: number): Promise<void> {
    const entitlements = await this.dependencies.entitlements.forOrganization(organizationId);
    assertEntitled(entitlements, "canInviteOrganizationMembers");
    assertWithinLimit(
      entitlements,
      "acceptedOrganizationMembers",
      entitlements.usage.acceptedOrganizationMembers
    );
  }

  private async getPendingInvitation(
    clerkOrganizationId: string,
    invitationId: string
  ): Promise<PendingOrganizationInvitation> {
    const invitations = await this.loadPendingInvitations(clerkOrganizationId);
    const invitation = invitations.find(({ id }) => id === invitationId);
    if (invitation) return invitation;
    throw new ErrorWithCode(ErrorCode.NotFound, "Pending organization invitation not found");
  }

  private async loadPendingInvitations(
    clerkOrganizationId: string
  ): Promise<PendingOrganizationInvitation[]> {
    try {
      return await this.dependencies.clerk.listPendingInvitations(clerkOrganizationId);
    } catch {
      throw providerFailure();
    }
  }

  private async reconcile(clerkOrganizationId: string): Promise<void> {
    const snapshot = await this.dependencies.organizationSource.getSnapshot(clerkOrganizationId);
    await this.dependencies.reconciler.reconcileOrganization(snapshot);
  }

  private async syncSeatsAndReconcile(
    organizationId: number,
    snapshot: ClerkOrganizationSnapshot
  ): Promise<void> {
    const desiredSeats = snapshot.memberships.filter(({ active }) => active).length;
    await this.dependencies.seatBilling.syncAcceptedSeats({ desiredSeats, organizationId });
    await this.dependencies.reconciler.reconcileOrganization(snapshot);
  }

  private async serialize<T>(organizationId: number, task: () => Promise<T>): Promise<T> {
    const queued = (this.transitions.get(organizationId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    this.transitions.set(organizationId, queued);
    try {
      return await queued;
    } finally {
      if (this.transitions.get(organizationId) === queued) this.transitions.delete(organizationId);
    }
  }
}

export { ClerkOrganizationCommandService };
export type { ClerkOrganizationCommandDependencies, PendingOrganizationInvitation };
