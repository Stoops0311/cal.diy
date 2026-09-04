import { WEBAPP_URL } from "@calcom/lib/constants";
import { prisma } from "@calcom/prisma";
import type { MembershipRole } from "@calcom/prisma/enums";
import type { GetServerSidePropsContext, NextApiResponse } from "next";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { getAuthProvider, getClerkBackendClient } from "./clerkClient";
import { authenticateClerkRequest } from "./clerkRequestAuth";
import { ensureLocalIdentity } from "./ensureLocalIdentity";
import type { LegacySessionOptions } from "./legacyNextAuthSession";
import { getLegacyNextAuthSession, getSessionForLocalUser } from "./legacyNextAuthSession";

type ConvenioSession = Session;
type CurrentSessionOptions = Partial<LegacySessionOptions>;
type ClerkSessionIdentity = { clerkUserId: string; expiresAt: number | null; organizationId: string | null };
type ClerkActiveProfile = {
  id: number;
  organization: {
    id: number;
    isPlatform: boolean;
    logoUrl: string | null;
    members: Array<{ role: MembershipRole }>;
    name: string;
    slug: string | null;
  };
  uid: string;
  username: string | null;
};
type ClerkUserProjection = {
  emailAddresses: Array<{
    emailAddress: string;
    id: string;
    verification?: { status?: string | null } | null;
  }>;
  externalId?: string | null;
  firstName?: string | null;
  imageUrl?: string | null;
  lastName?: string | null;
  primaryEmailAddressId?: string | null;
  username?: string | null;
};

type ClerkSessionProjectionDependencies = {
  ensureIdentity: typeof ensureLocalIdentity;
  findActiveProfile: (userId: number, clerkOrganizationId: string) => Promise<ClerkActiveProfile | null>;
  findMappedUser: (clerkUserId: string) => Promise<{ id: number; locked: boolean } | null>;
  getClerkUser: (clerkUserId: string) => Promise<ClerkUserProjection>;
  getLocalSession: typeof getSessionForLocalUser;
};

type CurrentSessionDependencies = {
  authenticateClerk: (req?: LegacySessionOptions["req"]) => Promise<{
    expiresAt: number | null;
    organizationId: string | null;
    userId: string;
  } | null>;
  getLegacySession: (options: CurrentSessionOptions) => Promise<ConvenioSession | null>;
  getProvider: () => "clerk" | "nextauth";
  getSessionForClerkUser: (identity: ClerkSessionIdentity) => Promise<ConvenioSession | null>;
};

function getPrimaryEmail(user: ClerkUserProjection): ClerkUserProjection["emailAddresses"][number] | null {
  return user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId) ?? null;
}

const clerkSessionProjectionDependencies: ClerkSessionProjectionDependencies = {
  ensureIdentity: ensureLocalIdentity,
  findActiveProfile: async (userId: number, clerkOrganizationId: string) =>
    prisma.profile.findFirst({
      where: {
        userId,
        organization: {
          archivedAt: null,
          clerkOrganizationId,
          members: { some: { accepted: true, userId } },
        },
      },
      select: {
        id: true,
        uid: true,
        username: true,
        organization: {
          select: {
            id: true,
            isPlatform: true,
            logoUrl: true,
            name: true,
            slug: true,
            members: {
              where: { accepted: true, userId },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    }),
  findMappedUser: async (clerkUserId: string): Promise<{ id: number; locked: boolean } | null> =>
    prisma.user.findUnique({
      where: { clerkUserId, locked: {} },
      select: { id: true, locked: true },
    }),
  getClerkUser: async (clerkUserId: string): Promise<ClerkUserProjection> => {
    const clerkUser = await getClerkBackendClient().users.getUser(clerkUserId);
    return {
      emailAddresses: clerkUser.emailAddresses,
      externalId: clerkUser.externalId,
      firstName: clerkUser.firstName,
      imageUrl: clerkUser.imageUrl,
      lastName: clerkUser.lastName,
      primaryEmailAddressId: clerkUser.primaryEmailAddressId,
      username: clerkUser.username,
    };
  },
  getLocalSession: getSessionForLocalUser,
};

async function projectClerkSession(
  { clerkUserId, expiresAt, organizationId }: ClerkSessionIdentity,
  dependencies: ClerkSessionProjectionDependencies = clerkSessionProjectionDependencies
): Promise<ConvenioSession | null> {
  const mappedUser = await dependencies.findMappedUser(clerkUserId);
  if (mappedUser?.locked) return null;

  let userId = mappedUser?.id;
  if (!userId) {
    const clerkUser = await dependencies.getClerkUser(clerkUserId);
    const primaryEmail = getPrimaryEmail(clerkUser);
    if (!primaryEmail) return null;

    const identity = await dependencies.ensureIdentity({
      avatarUrl: clerkUser.imageUrl ?? null,
      clerkUserId,
      emailVerified: primaryEmail.verification?.status === "verified",
      externalId: clerkUser.externalId ?? null,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      primaryEmail: primaryEmail.emailAddress,
      username: clerkUser.username ?? null,
    });
    userId = identity.userId;
  }

  const profile = organizationId ? await dependencies.findActiveProfile(userId, organizationId) : null;
  const membership = profile?.organization.members[0];
  const token: JWT = { sub: String(userId) };
  if (profile && membership) {
    const organization = profile.organization;
    token.belongsToActiveTeam = true;
    token.orgAwareUsername = profile.username;
    token.profileId = profile.id;
    token.upId = `prof-${profile.uid}`;
    if (!organization.isPlatform) {
      token.org = {
        id: organization.id,
        name: organization.name,
        slug: organization.slug ?? "",
        logoUrl: organization.logoUrl,
        fullDomain: WEBAPP_URL,
        domainSuffix: "",
        role: membership.role,
      };
    }
  }

  return dependencies.getLocalSession({
    expiresAt: expiresAt ?? Date.now(),
    token,
    userId,
  });
}

const defaultDependencies: CurrentSessionDependencies = {
  authenticateClerk: authenticateClerkRequest,
  getLegacySession: async (options: CurrentSessionOptions): Promise<ConvenioSession | null> => {
    if (!options.req) return null;
    return getLegacyNextAuthSession({ ...options, req: options.req });
  },
  getProvider: getAuthProvider,
  getSessionForClerkUser: projectClerkSession,
};

async function getCurrentSession(
  options: CurrentSessionOptions = {},
  dependencies: CurrentSessionDependencies = defaultDependencies
): Promise<ConvenioSession | null> {
  if (dependencies.getProvider() === "nextauth") return dependencies.getLegacySession(options);

  const clerkAuth = await dependencies.authenticateClerk(options.req);
  if (!clerkAuth) return null;
  return dependencies.getSessionForClerkUser({
    clerkUserId: clerkAuth.userId,
    expiresAt: clerkAuth.expiresAt,
    organizationId: clerkAuth.organizationId,
  });
}

async function getCurrentSessionFromRequest(
  req: LegacySessionOptions["req"],
  _res?: GetServerSidePropsContext["res"] | NextApiResponse,
  dependencies: CurrentSessionDependencies = defaultDependencies
): Promise<ConvenioSession | null> {
  return getCurrentSession({ req }, dependencies);
}

export { getCurrentSession, getCurrentSessionFromRequest, projectClerkSession };
export type {
  ClerkSessionProjectionDependencies,
  ConvenioSession,
  CurrentSessionDependencies,
  CurrentSessionOptions,
};
