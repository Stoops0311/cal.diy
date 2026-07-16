import { PLAN_ENTITLEMENTS } from "@calcom/features/billing/lib/entitlements";
import { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import type { PendingOrganizationInvitation } from "@calcom/features/organizations/services/ClerkOrganizationCommandService";
import { ClerkOrganizationCommandService } from "@calcom/features/organizations/services/ClerkOrganizationCommandService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type {
  ChangeOrganizationRoleInput,
  CreateOrganizationInput,
  InviteOrganizationMemberInput,
  OrganizationIdInput,
  OrganizationInvitationInput,
  RemoveOrganizationMemberInput,
} from "./organizations.schema";

type HandlerContext = { user: { id: number } };
type OrganizationCommands = Pick<
  ClerkOrganizationCommandService,
  | "archiveOrganization"
  | "changeMemberRole"
  | "createOrganization"
  | "inviteMember"
  | "listPendingInvitations"
  | "removeMember"
  | "resendInvitation"
  | "revokeInvitation"
>;
type OrganizationReadModel = Awaited<ReturnType<PrismaOrganizationReadRepository["getForMember"]>>;
type OrganizationReadRepository = {
  getForMember(input: { organizationId: number; userId: number }): Promise<OrganizationReadModel>;
};
type OrganizationHandlerDependencies = {
  commands: OrganizationCommands;
  entitlements: Pick<EntitlementService, "forOrganization">;
  read: OrganizationReadRepository;
};
type OrganizationMemberRole = "OWNER" | "ADMIN" | "MEMBER";
type OrganizationMembersView = {
  acceptedSeats: number;
  actorRole: OrganizationMemberRole;
  canManageInvitations: boolean;
  id: number;
  isArchived: boolean;
  members: Array<{
    avatarUrl: string | null;
    email: string;
    id: number;
    name: string | null;
    role: OrganizationMemberRole;
  }>;
  name: string;
  pendingInvitations: Array<{
    createdAt: Date;
    email: string;
    id: string;
    role: "ADMIN" | "MEMBER";
  }>;
  seatLimit: number;
  slug: string | null;
};

class PrismaOrganizationReadRepository implements OrganizationReadRepository {
  async getForMember(input: { organizationId: number; userId: number }) {
    return prisma.team.findFirst({
      where: {
        id: input.organizationId,
        isOrganization: true,
        members: { some: { accepted: true, userId: input.userId } },
      },
      select: {
        archivedAt: true,
        id: true,
        members: {
          where: { accepted: true },
          orderBy: { userId: "asc" },
          select: {
            accepted: true,
            role: true,
            user: { select: { avatarUrl: true, email: true, id: true, name: true } },
          },
        },
        name: true,
        slug: true,
      },
    });
  }
}

function defaultDependencies(): OrganizationHandlerDependencies {
  return {
    commands: new ClerkOrganizationCommandService(),
    entitlements: new EntitlementService(),
    read: new PrismaOrganizationReadRepository(),
  };
}

function clerkRole(role: "ADMIN" | "MEMBER"): "org:admin" | "org:member" {
  if (role === "ADMIN") return "org:admin";
  return "org:member";
}

function invitationRole(role: PendingOrganizationInvitation["role"]): "ADMIN" | "MEMBER" {
  if (role === "org:admin") return "ADMIN";
  return "MEMBER";
}

async function createOrganizationHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: CreateOrganizationInput;
}) {
  const dependencies = options.dependencies ?? defaultDependencies();
  return dependencies.commands.createOrganization({ actorUserId: options.ctx.user.id, ...options.input });
}

async function inviteOrganizationMemberHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: InviteOrganizationMemberInput;
}): Promise<void> {
  const dependencies = options.dependencies ?? defaultDependencies();
  await dependencies.commands.inviteMember({
    actorUserId: options.ctx.user.id,
    email: options.input.email,
    organizationId: options.input.organizationId,
    role: clerkRole(options.input.role),
  });
}

async function changeOrganizationRoleHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: ChangeOrganizationRoleInput;
}): Promise<void> {
  const dependencies = options.dependencies ?? defaultDependencies();
  await dependencies.commands.changeMemberRole({
    actorUserId: options.ctx.user.id,
    memberUserId: options.input.memberUserId,
    organizationId: options.input.organizationId,
    role: clerkRole(options.input.role),
  });
}

async function removeOrganizationMemberHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: RemoveOrganizationMemberInput;
}): Promise<void> {
  const dependencies = options.dependencies ?? defaultDependencies();
  await dependencies.commands.removeMember({ actorUserId: options.ctx.user.id, ...options.input });
}

async function archiveOrganizationHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: OrganizationIdInput;
}): Promise<void> {
  const dependencies = options.dependencies ?? defaultDependencies();
  await dependencies.commands.archiveOrganization({ actorUserId: options.ctx.user.id, ...options.input });
}

async function getOrganizationHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: OrganizationIdInput;
}): Promise<OrganizationReadModel> {
  const dependencies = options.dependencies ?? defaultDependencies();
  const organization = await dependencies.read.getForMember({
    organizationId: options.input.organizationId,
    userId: options.ctx.user.id,
  });
  if (!organization) throw new ErrorWithCode(ErrorCode.NotFound, "Organization not found");
  return organization;
}

async function membersOrganizationHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: OrganizationIdInput;
}): Promise<OrganizationMembersView> {
  const dependencies = options.dependencies ?? defaultDependencies();
  const organization = await dependencies.read.getForMember({
    organizationId: options.input.organizationId,
    userId: options.ctx.user.id,
  });
  const actor = organization?.members.find(({ user }) => user.id === options.ctx.user.id);
  if (!organization || !actor) throw new ErrorWithCode(ErrorCode.NotFound, "Organization not found");

  const entitlements = await dependencies.entitlements.forOrganization(organization.id);
  const isArchived = organization.archivedAt !== null;
  const isManager = actor.role === "OWNER" || actor.role === "ADMIN";
  const canManageInvitations = !isArchived && isManager && entitlements.canInviteOrganizationMembers;
  let pendingInvitations: PendingOrganizationInvitation[] = [];
  if (canManageInvitations) {
    pendingInvitations = await dependencies.commands.listPendingInvitations({
      actorUserId: options.ctx.user.id,
      organizationId: organization.id,
    });
  }

  return {
    acceptedSeats: organization.members.length,
    actorRole: actor.role,
    canManageInvitations,
    id: organization.id,
    isArchived,
    members: organization.members.map(({ role, user }) => ({ ...user, role })),
    name: organization.name,
    pendingInvitations: pendingInvitations.map(({ createdAt, email, id, role }) => ({
      createdAt,
      email,
      id,
      role: invitationRole(role),
    })),
    seatLimit: PLAN_ENTITLEMENTS.TEAM.acceptedOrganizationMembers,
    slug: organization.slug,
  };
}

async function revokeOrganizationInvitationHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: OrganizationInvitationInput;
}): Promise<void> {
  const dependencies = options.dependencies ?? defaultDependencies();
  await dependencies.commands.revokeInvitation({ actorUserId: options.ctx.user.id, ...options.input });
}

async function resendOrganizationInvitationHandler(options: {
  ctx: HandlerContext;
  dependencies?: OrganizationHandlerDependencies;
  input: OrganizationInvitationInput;
}): Promise<void> {
  const dependencies = options.dependencies ?? defaultDependencies();
  await dependencies.commands.resendInvitation({ actorUserId: options.ctx.user.id, ...options.input });
}

export {
  archiveOrganizationHandler,
  changeOrganizationRoleHandler,
  createOrganizationHandler,
  getOrganizationHandler,
  inviteOrganizationMemberHandler,
  membersOrganizationHandler,
  removeOrganizationMemberHandler,
  resendOrganizationInvitationHandler,
  revokeOrganizationInvitationHandler,
};
export type { OrganizationHandlerDependencies, OrganizationMembersView };
