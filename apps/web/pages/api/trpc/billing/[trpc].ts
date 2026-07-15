import { createNextApiHandler } from "@calcom/trpc/server/createNextApiHandler";
import { billingRouter } from "@calcom/trpc/server/routers/viewer/billing/_router";

export default createNextApiHandler(billingRouter);
