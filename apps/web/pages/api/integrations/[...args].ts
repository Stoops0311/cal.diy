import { throwIfNotHaveAdminAccessToTeam } from "@calcom/app-store/_utils/throwIfNotHaveAdminAccessToTeam";
import { appStoreMetadata } from "@calcom/app-store/apps.metadata.generated";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import {
  type EntitlementDenial,
  getEntitlementDenialFromError,
} from "@calcom/features/billing/lib/entitlementDenial";
import { CalendarConnectionEntitlementService } from "@calcom/features/calendars/services/CalendarConnectionEntitlementService";
import { deriveAppDictKeyFromType } from "@calcom/lib/deriveAppDictKeyFromType";
import { HttpError } from "@calcom/lib/http-error";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import prisma from "@calcom/prisma";
import type { AppDeclarativeHandler, AppHandler } from "@calcom/types/AppHandler";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";

const calendarConnectionEntitlements = new CalendarConnectionEntitlementService();

type IntegrationErrorResponse = {
  message: string;
  entitlement?: EntitlementDenial;
};

function getAppCategories(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  if ("categories" in metadata && Array.isArray(metadata.categories)) {
    return metadata.categories.filter((category): category is string => typeof category === "string");
  }
  if ("category" in metadata && typeof metadata.category === "string") return [metadata.category];
  return [];
}

const defaultIntegrationAddHandler = async ({
  slug,
  supportsMultipleInstalls,
  appType,
  user,
  teamId = undefined,
  createCredential,
}: {
  slug: string;
  supportsMultipleInstalls: boolean;
  appType: string;
  user?: Session["user"];
  teamId?: number;
  createCredential: AppDeclarativeHandler["createCredential"];
}) => {
  if (!user?.id) {
    throw new HttpError({ statusCode: 401, message: "You must be logged in to do this" });
  }
  if (!supportsMultipleInstalls) {
    const alreadyInstalled = await prisma.credential.findFirst({
      where: {
        appId: slug,
        ...(teamId ? { AND: [{ userId: user.id }, { teamId }] } : { userId: user.id }),
      },
    });
    if (alreadyInstalled) {
      throw new Error("App is already installed");
    }
  }

  await throwIfNotHaveAdminAccessToTeam({ teamId: teamId ?? null, userId: user.id });

  await createCredential({ user: user, appType, slug, teamId });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Check that user is authenticated
  req.session = await getServerSession({ req });

  const { args, teamId } = req.query;

  if (!Array.isArray(args)) {
    return res.status(404).json({ message: `API route not found` });
  }

  const [appName, apiEndpoint] = args;

  if (apiEndpoint === "add" && !req.session?.user?.id) {
    return res.status(401).json({ message: "You must be logged in to do this" });
  }

  try {
    /* Absolute path didn't work */
    const handlerMap = (await import("@calcom/app-store/apps.server.generated")).apiHandlers;
    const handlerKey = deriveAppDictKeyFromType(appName, handlerMap);
    const handlers = await handlerMap[handlerKey as keyof typeof handlerMap];
    if (!handlers) throw new HttpError({ statusCode: 404, message: `No handlers found for ${handlerKey}` });
    const handler = handlers[apiEndpoint as keyof typeof handlers] as AppHandler;
    if (typeof handler === "undefined")
      throw new HttpError({ statusCode: 404, message: `API handler not found` });

    if ((apiEndpoint === "add" || apiEndpoint === "callback") && req.session?.user?.id) {
      await calendarConnectionEntitlements.assertCanConnectApp({
        categories: getAppCategories(appStoreMetadata[handlerKey as keyof typeof appStoreMetadata]),
        userId: req.session.user.id,
      });
    }

    if (typeof handler === "function") {
      await handler(req, res);
    } else {
      await defaultIntegrationAddHandler({ user: req.session?.user, teamId: Number(teamId), ...handler });
      const redirectUrl = handler.redirect?.url ?? undefined;
      res.json({ url: redirectUrl, newTab: handler.redirect?.newTab });
    }
    if (!res.writableEnded) res.status(200);
    return;
  } catch (error) {
    console.error(error);
    const httpError = getServerErrorFromUnknown(error);
    const entitlement = getEntitlementDenialFromError(error);
    const body: IntegrationErrorResponse = {
      message: httpError.message,
      ...(entitlement ? { entitlement } : {}),
    };
    return res.status(httpError.statusCode).json(body);
  }
};

export default handler;
