import { assertEntitled } from "@calcom/features/billing/lib/entitlements";
import { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import { updateTriggerForExistingBookings } from "@calcom/features/webhooks/lib/scheduleTrigger";
import { validateUrlForSSRFSync } from "@calcom/lib/ssrfProtection";
import { prisma } from "@calcom/prisma";
import type { Prisma, Webhook } from "@calcom/prisma/client";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import { v4 } from "uuid";
import type { TCreateInputSchema } from "./create.schema";

type CreateOptions = {
  ctx: {
    user: Pick<NonNullable<TrpcSessionUser>, "id" | "role">;
  };
  dependencies?: WebhookHandlerDependencies;
  input: TCreateInputSchema;
};

type WebhookHandlerDependencies = {
  create(ctx: CreateOptions["ctx"], input: TCreateInputSchema): Promise<Webhook>;
  entitlements: Pick<EntitlementService, "forOrganization" | "forUser">;
};

async function createWebhook(ctx: CreateOptions["ctx"], input: TCreateInputSchema): Promise<Webhook> {
  const { user } = ctx;

  const validation = validateUrlForSSRFSync(input.subscriberUrl);
  if (!validation.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Webhook URL is not allowed: ${validation.error}`,
    });
  }

  const { webhookId: _webhookId, ...inputWithoutWebhookId } = input;
  const webhookData: Prisma.WebhookCreateInput = {
    id: v4(),
    ...inputWithoutWebhookId,
  };
  if (input.platform && user.role !== "ADMIN") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (!input.platform && !input.eventTypeId) {
    webhookData.user = { connect: { id: user.id } };
  }

  if (input.eventTypeId) {
    const parentManagedEvt = await prisma.eventType.findFirst({
      where: {
        id: input.eventTypeId,
        parentId: {
          not: null,
        },
      },
      select: {
        parentId: true,
        metadata: true,
      },
    });

    if (parentManagedEvt?.parentId) {
      const isLocked = !EventTypeMetaDataSchema.parse(parentManagedEvt.metadata)?.managedEventConfig
        ?.unlockedFields?.webhooks;
      if (isLocked) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
    }
  }

  let newWebhook: Webhook;
  try {
    newWebhook = await prisma.webhook.create({
      data: webhookData,
    });
  } catch (error) {
    // Avoid printing raw prisma error on frontend
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create webhook" });
  }

  await updateTriggerForExistingBookings(newWebhook, [], newWebhook.eventTriggers);

  return newWebhook;
}

const defaultDependencies: WebhookHandlerDependencies = {
  create: createWebhook,
  entitlements: new EntitlementService(),
};

export const createHandler = async ({ ctx, dependencies = defaultDependencies, input }: CreateOptions) => {
  const entitlements = input.teamId
    ? await dependencies.entitlements.forOrganization(input.teamId)
    : await dependencies.entitlements.forUser(ctx.user.id);
  assertEntitled(entitlements, "canCreateWebhooks");
  return dependencies.create(ctx, input);
};

export type { WebhookHandlerDependencies };
