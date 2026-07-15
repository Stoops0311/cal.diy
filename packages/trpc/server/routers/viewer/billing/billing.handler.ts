import { PolarCheckoutService } from "@calcom/features/billing/services/PolarCheckoutService";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type { BillingInterval, BillingStatus, PlanKey } from "@calcom/prisma/enums";

type BillingProjection = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  interval: BillingInterval | null;
  plan: PlanKey;
  seatCount: number;
  status: BillingStatus;
};

type BillingSubjectInput = { organizationId?: number };
type BillingPlanInput = BillingSubjectInput & {
  interval: BillingInterval;
  plan: Exclude<PlanKey, "FREE">;
};
type BillingContext = { user: { id: number } };
type BillingReadRepository = {
  getOrganizationProjection(input: {
    actorUserId: number;
    organizationId: number;
  }): Promise<{ subscription: BillingProjection | null } | null>;
  getUserProjection(userId: number): Promise<BillingProjection | null>;
};
type BillingCommands = Pick<
  PolarCheckoutService,
  "cancelAtPeriodEnd" | "changePlan" | "createCheckout" | "createPortalSession" | "reconcile"
>;
type BillingHandlerDependencies = {
  commands: BillingCommands;
  rateLimit(identifier: string): Promise<void>;
  read: BillingReadRepository;
};

const billingProjectionSelect = {
  cancelAtPeriodEnd: true,
  currentPeriodEnd: true,
  currentPeriodStart: true,
  interval: true,
  plan: true,
  seatCount: true,
  status: true,
} as const;

class PrismaBillingReadRepository implements BillingReadRepository {
  async getUserProjection(userId: number): Promise<BillingProjection | null> {
    return prisma.billingSubscription.findUnique({
      where: { userId },
      select: billingProjectionSelect,
    });
  }

  async getOrganizationProjection(input: {
    actorUserId: number;
    organizationId: number;
  }): Promise<{ subscription: BillingProjection | null } | null> {
    const organization = await prisma.team.findFirst({
      where: {
        archivedAt: null,
        id: input.organizationId,
        isOrganization: true,
        members: {
          some: {
            accepted: true,
            role: { in: ["OWNER", "ADMIN"] },
            userId: input.actorUserId,
          },
        },
      },
      select: {
        billingSubscription: { select: billingProjectionSelect },
      },
    });
    if (!organization) return null;
    return { subscription: organization.billingSubscription };
  }
}

let defaultDependencies: BillingHandlerDependencies | undefined;

function getDefaultDependencies(): BillingHandlerDependencies {
  defaultDependencies ??= {
    commands: new PolarCheckoutService(),
    rateLimit: async (identifier) => {
      await checkRateLimitAndThrowError({ identifier, rateLimitingType: "core" });
    },
    read: new PrismaBillingReadRepository(),
  };
  return defaultDependencies;
}

function freeProjection(): BillingProjection {
  return {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    currentPeriodStart: null,
    interval: null,
    plan: "FREE",
    seatCount: 1,
    status: "NONE",
  };
}

function validatePolarUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ErrorWithCode(ErrorCode.InternalServerError, "Invalid Polar redirect URL");
  }
  if (url.protocol !== "https:" || (url.hostname !== "polar.sh" && !url.hostname.endsWith(".polar.sh"))) {
    throw new ErrorWithCode(ErrorCode.InternalServerError, "Invalid Polar redirect URL");
  }
  return url.toString();
}

async function getBillingHandler({
  ctx,
  dependencies = getDefaultDependencies(),
  input,
}: {
  ctx: BillingContext;
  dependencies?: BillingHandlerDependencies;
  input: BillingSubjectInput;
}) {
  if (input.organizationId === undefined) {
    const projection = (await dependencies.read.getUserProjection(ctx.user.id)) ?? freeProjection();
    return { ...projection, subject: { id: ctx.user.id, type: "USER" as const } };
  }

  const organization = await dependencies.read.getOrganizationProjection({
    actorUserId: ctx.user.id,
    organizationId: input.organizationId,
  });
  if (!organization) {
    throw new ErrorWithCode(ErrorCode.Forbidden, "Organization billing access denied");
  }
  return {
    ...(organization.subscription ?? freeProjection()),
    subject: { id: input.organizationId, type: "ORGANIZATION" as const },
  };
}

async function createCheckoutHandler({
  ctx,
  dependencies = getDefaultDependencies(),
  input,
}: {
  ctx: BillingContext;
  dependencies?: BillingHandlerDependencies;
  input: BillingPlanInput;
}) {
  const checkout = await dependencies.commands.createCheckout(ctx.user.id, input);
  return { checkoutUrl: validatePolarUrl(checkout.checkoutUrl) };
}

async function createPortalSessionHandler({
  ctx,
  dependencies = getDefaultDependencies(),
  input,
}: {
  ctx: BillingContext;
  dependencies?: BillingHandlerDependencies;
  input: BillingSubjectInput;
}) {
  const portal = await dependencies.commands.createPortalSession(ctx.user.id, input);
  return { portalUrl: validatePolarUrl(portal.portalUrl) };
}

async function changePlanHandler({
  ctx,
  dependencies = getDefaultDependencies(),
  input,
}: {
  ctx: BillingContext;
  dependencies?: BillingHandlerDependencies;
  input: BillingPlanInput;
}) {
  await dependencies.commands.changePlan(ctx.user.id, input);
}

async function cancelAtPeriodEndHandler({
  ctx,
  dependencies = getDefaultDependencies(),
  input,
}: {
  ctx: BillingContext;
  dependencies?: BillingHandlerDependencies;
  input: BillingSubjectInput;
}) {
  await dependencies.commands.cancelAtPeriodEnd(ctx.user.id, input);
}

async function reconcileBillingHandler({
  ctx,
  dependencies = getDefaultDependencies(),
  input,
}: {
  ctx: BillingContext;
  dependencies?: BillingHandlerDependencies;
  input: BillingSubjectInput;
}) {
  const subject =
    input.organizationId === undefined ? `user:${ctx.user.id}` : `organization:${input.organizationId}`;
  await dependencies.rateLimit(`billing-reconcile:${ctx.user.id}:${subject}`);
  await dependencies.commands.reconcile(ctx.user.id, input);
}

export {
  cancelAtPeriodEndHandler,
  changePlanHandler,
  createCheckoutHandler,
  createPortalSessionHandler,
  getBillingHandler,
  reconcileBillingHandler,
};
export type { BillingHandlerDependencies };
