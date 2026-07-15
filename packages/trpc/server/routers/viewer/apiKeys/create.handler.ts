import process from "node:process";
import { generateUniqueAPIKey } from "@calcom/features/api-keys-legacy/api-keys/lib/apiKeys";
import { assertEntitled } from "@calcom/features/billing/lib/entitlements";
import { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { v4 } from "uuid";
import type { TrpcSessionUser } from "../../../types";
import { checkPermissions } from "./_auth-middleware";
import type { TCreateInputSchema } from "./create.schema";

type CreateHandlerOptions = {
  ctx: {
    user: Pick<NonNullable<TrpcSessionUser>, "id">;
  };
  dependencies?: ApiKeyHandlerDependencies;
  input: TCreateInputSchema;
};

type ApiKeyHandlerDependencies = {
  create(ctx: CreateHandlerOptions["ctx"], input: TCreateInputSchema): Promise<string>;
  entitlements: Pick<EntitlementService, "forOrganization" | "forUser">;
};

async function createApiKey(ctx: CreateHandlerOptions["ctx"], input: TCreateInputSchema): Promise<string> {
  const [hashedApiKey, apiKey] = generateUniqueAPIKey();

  // Here we snap never expires before deleting it so it's not passed to prisma create call.
  const { neverExpires, teamId, ...rest } = input;
  const userId = ctx.user.id;

  /** Only admin or owner can create apiKeys of team (if teamId is passed) */
  await checkPermissions({ userId, teamId, role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } });

  await prisma.apiKey.create({
    data: {
      id: v4(),
      userId: ctx.user.id,
      teamId,
      ...rest,
      // And here we pass a null to expiresAt if never expires is true. otherwise just pass expiresAt from input
      expiresAt: neverExpires ? null : rest.expiresAt,
      hashedKey: hashedApiKey,
    },
  });

  const apiKeyPrefix = process.env.API_KEY_PREFIX ?? "cal_";

  const prefixedApiKey = `${apiKeyPrefix}${apiKey}`;

  return prefixedApiKey;
}

const defaultDependencies: ApiKeyHandlerDependencies = {
  create: createApiKey,
  entitlements: new EntitlementService(),
};

export const createHandler = async ({
  ctx,
  dependencies = defaultDependencies,
  input,
}: CreateHandlerOptions) => {
  const entitlements = input.teamId
    ? await dependencies.entitlements.forOrganization(input.teamId)
    : await dependencies.entitlements.forUser(ctx.user.id);
  assertEntitled(entitlements, "canCreateApiKeys");
  return dependencies.create(ctx, input);
};

export type { ApiKeyHandlerDependencies };
