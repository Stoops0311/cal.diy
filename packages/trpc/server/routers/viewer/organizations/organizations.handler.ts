import { ClerkOrganizationCommandService } from "@calcom/features/organizations/services/ClerkOrganizationCommandService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type {
  ChangeOrganizationRoleInput,
  CreateOrganizationInput,
  InviteOrganizationMemberInput,
  OrganizationIdInput,
  RemoveOrganizationMemberInput,
} from "./organizations.schema";

type HandlerContext = { user: { id: number } };
type OrganizationCommands = Pick<
  ClerkOrganizationCommandService,
  "archiveOrganization" | "changeMemberRole" | "createOrganization" | "inviteMember" | "removeMember"
>;
type OrganizationReadModel = Awaited<ReturnType<PrismaOrganizationReadRepository["getForMember"]>>;
type OrganizationReadRepository = {
  getForMember(input: { organizationId: number; userId: number }): Promise<OrganizationReadModel>;
};
type OrganizationHandlerDependencies = {
  commands: OrganizationCommands;
  read: OrganizationReadRepository;
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
  return { commands: new ClerkOrganizationCommandService(), read: new PrismaOrganizationReadRepository() };
}

function clerkRole(role: "ADMIN" | "MEMBER"): "org:admin" | "org:member" {
  if (role === "ADMIN") return "org:admin";
  return "org:member";
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

export {
  archiveOrganizationHandler,
  changeOrganizationRoleHandler,
  createOrganizationHandler,
  getOrganizationHandler,
  inviteOrganizationMemberHandler,
  removeOrganizationMemberHandler,
};
export type { OrganizationHandlerDependencies };
