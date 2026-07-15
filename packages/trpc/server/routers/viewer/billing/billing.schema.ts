import { z } from "zod";

const organizationId = z.number().int().positive();
const billingInterval = z.enum(["MONTH", "YEAR"]);

const ZBillingSubjectSchema = z.object({
  organizationId: organizationId.optional(),
});

const ZBillingPlanSchema = z.discriminatedUnion("plan", [
  z.object({
    interval: billingInterval,
    organizationId: z.never().optional(),
    plan: z.literal("PRO"),
  }),
  z.object({
    interval: billingInterval,
    organizationId,
    plan: z.literal("TEAM"),
  }),
]);

export { ZBillingPlanSchema, ZBillingSubjectSchema };
export type BillingPlanInput = z.infer<typeof ZBillingPlanSchema>;
export type BillingSubjectInput = z.infer<typeof ZBillingSubjectSchema>;
