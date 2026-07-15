import { z } from "zod";

const organizationId = z.number().int().positive();
const organizationRole = z.enum(["ADMIN", "MEMBER"]);

const ZCreateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
const ZOrganizationIdSchema = z.object({ organizationId });
const ZInviteOrganizationMemberSchema = ZOrganizationIdSchema.extend({
  email: z.string().trim().email(),
  role: organizationRole,
});
const ZChangeOrganizationRoleSchema = ZOrganizationIdSchema.extend({
  memberUserId: z.number().int().positive(),
  role: organizationRole,
});
const ZRemoveOrganizationMemberSchema = ZOrganizationIdSchema.extend({
  memberUserId: z.number().int().positive(),
});

export {
  ZChangeOrganizationRoleSchema,
  ZCreateOrganizationSchema,
  ZInviteOrganizationMemberSchema,
  ZOrganizationIdSchema,
  ZRemoveOrganizationMemberSchema,
};
export type CreateOrganizationInput = z.infer<typeof ZCreateOrganizationSchema>;
export type OrganizationIdInput = z.infer<typeof ZOrganizationIdSchema>;
export type InviteOrganizationMemberInput = z.infer<typeof ZInviteOrganizationMemberSchema>;
export type ChangeOrganizationRoleInput = z.infer<typeof ZChangeOrganizationRoleSchema>;
export type RemoveOrganizationMemberInput = z.infer<typeof ZRemoveOrganizationMemberSchema>;
