import { getClerkBackendClient } from "@calcom/features/auth/lib/clerkClient";
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
type OrganizationAccess = { actorRole: MembershipRole; clerkOrganizationId: string };
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
  removeMember(input: { clerkOrganizationId: string; clerkUserId: string }): Promise<void>;
};

type OrganizationCommandRepository = {
  getActorClerkUserId(userId: number): Promise<string>;
  getOrganizationAccess(input: { actorUserId: number; organizationId: number }): Promise<OrganizationAccess>;
  getTargetMember(input: { memberUserId: number; organizationId: number }): Promise<TargetMember>;
  ownerCount(organizationId: number): Promise<number>;
};

type OrganizationReconciler = Pick<ClerkOrganizationSyncService, "reconcileOrganization">;

type ClerkOrganizationCommandDependencies = {
  clerk: ClerkOrganizationCommandGateway;
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
    return { actorRole, clerkOrganizationId: organization.clerkOrganizationId };
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

class UnconfiguredSeatBilling implements OrganizationSeatBillingPort {
  async syncAcceptedSeats(): Promise<void> {
    throw new ErrorWithCode(ErrorCode.EntitlementRequired, "Organization seat billing is not configured");
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
        organizationSource: new ClerkBackendOrganizationSource(),
        reconciler: new ClerkOrganizationSyncService(),
        repository: new PrismaOrganizationCommandRepository(),
        seatBilling: new UnconfiguredSeatBilling(),
      } satisfies ClerkOrganizationCommandDependencies);
  }

  async createOrganization(input: {
    actorUserId: number;
    name: string;
    slug: string;
  }): Promise<ClerkOrganizationSyncResult> {
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
    const inviterClerkUserId = await this.dependencies.repository.getActorClerkUserId(input.actorUserId);
    try {
      await this.dependencies.clerk.inviteMember({
        clerkOrganizationId: access.clerkOrganizationId,
        email: input.email,
        inviterClerkUserId,
        role: input.role,
      });
    } catch {
      throw providerFailure();
    }
    await this.reconcile(access.clerkOrganizationId);
  }

  async changeMemberRole(input: {
    actorUserId: number;
    memberUserId: number;
    organizationId: number;
    role: ClerkRole;
  }): Promise<void> {
    const access = await this.authorize(input.actorUserId, input.organizationId);
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
      const access = await this.authorize(input.actorUserId, input.organizationId);
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
    return this.serialize(input.organizationId, () =>
      this.syncSeatsAndReconcile(input.organizationId, input.snapshot)
    );
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

  private async authorize(actorUserId: number, organizationId: number): Promise<OrganizationAccess> {
    const access = await this.dependencies.repository.getOrganizationAccess({ actorUserId, organizationId });
    requireAdmin(access);
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
export type { ClerkOrganizationCommandDependencies };
