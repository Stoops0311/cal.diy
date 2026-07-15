import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { ZBillingPlanSchema, ZBillingSubjectSchema } from "./billing.schema";

const billingRouter = router({
  cancelAtPeriodEnd: authedProcedure.input(ZBillingSubjectSchema).mutation(async ({ ctx, input }) => {
    const { cancelAtPeriodEndHandler } = await import("./billing.handler");
    return cancelAtPeriodEndHandler({ ctx, input });
  }),
  changePlan: authedProcedure.input(ZBillingPlanSchema).mutation(async ({ ctx, input }) => {
    const { changePlanHandler } = await import("./billing.handler");
    return changePlanHandler({ ctx, input });
  }),
  createCheckout: authedProcedure.input(ZBillingPlanSchema).mutation(async ({ ctx, input }) => {
    const { createCheckoutHandler } = await import("./billing.handler");
    return createCheckoutHandler({ ctx, input });
  }),
  createPortalSession: authedProcedure.input(ZBillingSubjectSchema).mutation(async ({ ctx, input }) => {
    const { createPortalSessionHandler } = await import("./billing.handler");
    return createPortalSessionHandler({ ctx, input });
  }),
  get: authedProcedure.input(ZBillingSubjectSchema).query(async ({ ctx, input }) => {
    const { getBillingHandler } = await import("./billing.handler");
    return getBillingHandler({ ctx, input });
  }),
  reconcile: authedProcedure.input(ZBillingSubjectSchema).mutation(async ({ ctx, input }) => {
    const { reconcileBillingHandler } = await import("./billing.handler");
    return reconcileBillingHandler({ ctx, input });
  }),
  summary: authedProcedure.query(async ({ ctx }) => {
    const { summaryBillingHandler } = await import("./billing.handler");
    return summaryBillingHandler({ ctx });
  }),
});

export { billingRouter };
