import { createRequire } from "node:module";

type VerifiedCustomerState = {
  activeSubscriptions: Array<{
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date;
    currentPeriodStart: Date;
    id: string;
    metadata: Record<string, unknown>;
    modifiedAt: Date | null;
    productId: string;
    status: string;
  }>;
  deletedAt: Date | null;
  externalId?: string | null;
  grantedBenefits: Array<{ benefitId: string }>;
  id: string;
  modifiedAt: Date | null;
  type: "individual" | "team";
};

type VerifiedPolarEvent = { data?: VerifiedCustomerState; timestamp: Date; type: string };
type PolarWebhookModule = {
  validateEvent(body: string, headers: Record<string, string>, secret: string): VerifiedPolarEvent;
};

const require = createRequire(import.meta.url);

function validatePolarWebhook(
  body: string,
  headers: Record<string, string>,
  secret: string
): VerifiedPolarEvent {
  const webhooks = require("@polar-sh/sdk/webhooks") as PolarWebhookModule;
  return webhooks.validateEvent(body, headers, secret);
}

export { validatePolarWebhook };
export type { VerifiedPolarEvent };
