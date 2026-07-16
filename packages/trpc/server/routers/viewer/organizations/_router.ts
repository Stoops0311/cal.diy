import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import {
  ZChangeOrganizationRoleSchema,
  ZCreateOrganizationSchema,
  ZInviteOrganizationMemberSchema,
  ZOrganizationIdSchema,
  ZOrganizationInvitationSchema,
  ZRemoveOrganizationMemberSchema,
} from "./organizations.schema";

const organizationsRouter = router({
  archive: authedProcedure.input(ZOrganizationIdSchema).mutation(async ({ ctx, input }) => {
    const { archiveOrganizationHandler } = await import("./organizations.handler");
    return archiveOrganizationHandler({ ctx, input });
  }),
  changeRole: authedProcedure.input(ZChangeOrganizationRoleSchema).mutation(async ({ ctx, input }) => {
    const { changeOrganizationRoleHandler } = await import("./organizations.handler");
    return changeOrganizationRoleHandler({ ctx, input });
  }),
  create: authedProcedure.input(ZCreateOrganizationSchema).mutation(async ({ ctx, input }) => {
    const { createOrganizationHandler } = await import("./organizations.handler");
    return createOrganizationHandler({ ctx, input });
  }),
  get: authedProcedure.input(ZOrganizationIdSchema).query(async ({ ctx, input }) => {
    const { getOrganizationHandler } = await import("./organizations.handler");
    return getOrganizationHandler({ ctx, input });
  }),
  invite: authedProcedure.input(ZInviteOrganizationMemberSchema).mutation(async ({ ctx, input }) => {
    const { inviteOrganizationMemberHandler } = await import("./organizations.handler");
    return inviteOrganizationMemberHandler({ ctx, input });
  }),
  members: authedProcedure.input(ZOrganizationIdSchema).query(async ({ ctx, input }) => {
    const { membersOrganizationHandler } = await import("./organizations.handler");
    return membersOrganizationHandler({ ctx, input });
  }),
  removeMember: authedProcedure.input(ZRemoveOrganizationMemberSchema).mutation(async ({ ctx, input }) => {
    const { removeOrganizationMemberHandler } = await import("./organizations.handler");
    return removeOrganizationMemberHandler({ ctx, input });
  }),
  resendInvitation: authedProcedure.input(ZOrganizationInvitationSchema).mutation(async ({ ctx, input }) => {
    const { resendOrganizationInvitationHandler } = await import("./organizations.handler");
    return resendOrganizationInvitationHandler({ ctx, input });
  }),
  revokeInvitation: authedProcedure.input(ZOrganizationInvitationSchema).mutation(async ({ ctx, input }) => {
    const { revokeOrganizationInvitationHandler } = await import("./organizations.handler");
    return revokeOrganizationInvitationHandler({ ctx, input });
  }),
});

export { organizationsRouter };
