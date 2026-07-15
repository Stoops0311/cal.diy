import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import { LRUCache } from "lru-cache";
import type { GetServerSidePropsContext, NextApiRequest } from "next";
import type { AuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";

class LicenseKeySingleton {
  static async getInstance(..._args: unknown[]): Promise<LicenseKeySingleton> {
    return new LicenseKeySingleton();
  }
  async checkLicense(): Promise<boolean> {
    return true;
  }
}
class DeploymentRepository {
  async findFirst(..._args: unknown[]): Promise<null> {
    return null;
  }
}

type LegacySessionOptions = {
  req: NextApiRequest | GetServerSidePropsContext["req"];
  authOptions?: AuthOptions;
};

const log = logger.getSubLogger({ prefix: ["getServerSession"] });
const CACHE = new LRUCache<string, Session>({ max: 1000 });

async function getSessionForLocalUser({
  expiresAt,
  token,
  userId,
}: {
  expiresAt: number;
  token: JWT;
  userId: number;
}): Promise<Session | null> {
  const userFromDb = await prisma.user.findUnique({ where: { id: userId } });
  if (!userFromDb) return null;

  const deploymentRepo = new DeploymentRepository();
  const licenseKeyService = await LicenseKeySingleton.getInstance(deploymentRepo);
  const hasValidLicense = await licenseKeyService.checkLicense();
  const upId = token.upId ?? `usr-${userFromDb.id}`;

  const userRepository = new UserRepository(prisma);
  const user = await userRepository.enrichUserWithTheProfile({ user: userFromDb, upId });
  const session: Session = {
    hasValidLicense,
    expires: new Date(expiresAt).toISOString(),
    user: {
      id: user.id,
      uuid: user.uuid,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      email_verified: user.emailVerified !== null,
      completedOnboarding: user.completedOnboarding,
      role: user.role,
      image: getUserAvatarUrl({ avatarUrl: user.avatarUrl }),
      belongsToActiveTeam: token.belongsToActiveTeam,
      org: token.org,
      orgAwareUsername: token.orgAwareUsername,
      locale: user.locale ?? undefined,
      profile: user.profile,
    },
    profileId: token.profileId,
    upId,
  };

  if (token.impersonatedBy?.id) {
    const impersonatedByUser = await prisma.user.findUnique({
      where: { id: token.impersonatedBy.id },
      select: { id: true, role: true, uuid: true },
    });
    if (impersonatedByUser) session.user.impersonatedBy = impersonatedByUser;
  }

  return session;
}

async function getLegacyNextAuthSession(options: LegacySessionOptions): Promise<Session | null> {
  const { req, authOptions: { secret } = {} } = options;
  const token = await getToken({ req, secret });

  log.debug("Getting server session", safeStringify({ token }));
  if (!token?.email || !token.sub) return null;

  const cacheKey = JSON.stringify(token);
  const cachedSession = CACHE.get(cacheKey);
  if (cachedSession) return cachedSession;

  const userId = Number(token.sub);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    log.warn("Invalid or missing user ID in token", { sub: token.sub });
    return null;
  }

  let expiresAt = Date.now();
  if (typeof token.exp === "number") expiresAt = token.exp * 1000;
  const session = await getSessionForLocalUser({
    expiresAt,
    token,
    userId,
  });
  if (!session) {
    log.warn("No user found for valid token", { userId });
    return null;
  }

  CACHE.set(cacheKey, session);
  return session;
}

export { getLegacyNextAuthSession, getSessionForLocalUser };
export type { LegacySessionOptions };
