import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { isPrismaError } from "@calcom/lib/server/getServerErrorFromUnknown";
import slugify from "@calcom/lib/slugify";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { getClerkBackendClient } from "./clerkClient";

type ClerkIdentityInput = {
  clerkUserId: string;
  externalId: string | null;
  primaryEmail: string;
  emailVerified: boolean;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
};

type EnsureLocalIdentityDependencies = {
  updateClerkExternalId: (clerkUserId: string, externalId: string) => Promise<void>;
};

type LocalIdentity = {
  id: number;
  locked: boolean;
  completedOnboarding: boolean;
};

type EnsureLocalIdentityResult = {
  userId: number;
  created: boolean;
  completedOnboarding: boolean;
};

const localIdentitySelect: {
  completedOnboarding: true;
  id: true;
  locked: true;
} = {
  completedOnboarding: true,
  id: true,
  locked: true,
} satisfies Prisma.UserSelect;

// The `locked` key opts out of the global locked-user filter so this boundary can return a stable lock error.
const includeLockedUsers: Prisma.BoolFilter = {};

async function updateClerkExternalId(clerkUserId: string, externalId: string): Promise<void> {
  await getClerkBackendClient().users.updateUser(clerkUserId, { externalId });
}

const defaultDependencies: EnsureLocalIdentityDependencies = { updateClerkExternalId };

function parseExternalUserId(externalId: string | null): number | null {
  if (externalId === null) return null;

  const userId = Number(externalId);
  if (!Number.isSafeInteger(userId) || userId <= 0 || String(userId) !== externalId) {
    throw new ErrorWithCode(ErrorCode.ClerkExternalIdInvalid, "Clerk externalId is not a local user id");
  }

  return userId;
}

function assertUsableUser(user: LocalIdentity): void {
  if (user.locked) {
    throw new ErrorWithCode(ErrorCode.LocalAccountLocked, "The local account is locked");
  }
}

async function findLocalIdentity(
  tx: Prisma.TransactionClient,
  input: ClerkIdentityInput
): Promise<LocalIdentity | null> {
  const externalUserId = parseExternalUserId(input.externalId);
  const byClerkId = await tx.user.findUnique({
    where: {
      clerkUserId: input.clerkUserId,
      locked: includeLockedUsers,
    },
    select: localIdentitySelect,
  });

  if (byClerkId) {
    if (externalUserId !== null && externalUserId !== byClerkId.id) {
      throw new ErrorWithCode(
        ErrorCode.ClerkIdentityAmbiguous,
        "Clerk identifiers resolve to different users"
      );
    }
    return byClerkId;
  }

  if (externalUserId !== null) {
    const byExternalId = await tx.user.findUnique({
      where: {
        id: externalUserId,
        locked: includeLockedUsers,
      },
      select: {
        ...localIdentitySelect,
        clerkUserId: true,
      },
    });
    if (byExternalId?.clerkUserId && byExternalId.clerkUserId !== input.clerkUserId) {
      throw new ErrorWithCode(ErrorCode.ClerkIdentityAmbiguous, "External id is already mapped");
    }
    if (byExternalId) return byExternalId;
  }

  const byEmail = await tx.user.findMany({
    where: {
      email: { equals: input.primaryEmail, mode: "insensitive" },
      locked: includeLockedUsers,
    },
    select: {
      ...localIdentitySelect,
      clerkUserId: true,
    },
    take: 2,
  });

  if (byEmail.length > 1 || (byEmail[0]?.clerkUserId && byEmail[0].clerkUserId !== input.clerkUserId)) {
    throw new ErrorWithCode(ErrorCode.ClerkIdentityAmbiguous, "Verified email does not resolve uniquely");
  }

  return byEmail[0] ?? null;
}

async function getAvailableUsername(
  tx: Prisma.TransactionClient,
  input: ClerkIdentityInput
): Promise<string> {
  const emailLocalPart = input.primaryEmail.split("@")[0] ?? "user";
  const base = slugify(input.username ?? emailLocalPart) || "user";

  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    let candidate = base;
    if (suffix > 1) candidate = `${base}-${suffix}`;
    const existing = await tx.user.findFirst({
      where: {
        organizationId: null,
        username: candidate,
        locked: includeLockedUsers,
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new ErrorWithCode(ErrorCode.UsernameUnavailable, "Unable to allocate a local username");
}

async function mapOrCreateLocalIdentity(
  input: ClerkIdentityInput
): Promise<{ identity: LocalIdentity; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await findLocalIdentity(tx, input);
    if (existing) {
      assertUsableUser(existing);
      const identity = await tx.user.update({
        where: { id: existing.id },
        data: { clerkUserId: input.clerkUserId },
        select: localIdentitySelect,
      });
      return { identity, created: false };
    }

    const username = await getAvailableUsername(tx, input);
    const identity = await tx.user.create({
      data: {
        avatarUrl: input.avatarUrl,
        clerkUserId: input.clerkUserId,
        email: input.primaryEmail,
        emailVerified: new Date(),
        name: input.name,
        username,
      },
      select: localIdentitySelect,
    });
    return { identity, created: true };
  });
}

async function ensureLocalIdentity(
  input: ClerkIdentityInput,
  dependencies: EnsureLocalIdentityDependencies = defaultDependencies
): Promise<EnsureLocalIdentityResult> {
  if (!input.emailVerified) {
    throw new ErrorWithCode(ErrorCode.ClerkEmailUnverified, "Clerk primary email must be verified");
  }

  const mapped = await mapOrCreateLocalIdentity(input).catch((error: unknown) => {
    if (!isPrismaError(error) || error.code !== "P2002") throw error;
    return mapOrCreateLocalIdentity(input);
  });

  assertUsableUser(mapped.identity);
  if (input.externalId !== String(mapped.identity.id)) {
    try {
      await dependencies.updateClerkExternalId(input.clerkUserId, String(mapped.identity.id));
    } catch {
      throw new ErrorWithCode(ErrorCode.ClerkExternalIdUpdateFailed, "Unable to update Clerk externalId");
    }
  }

  return {
    completedOnboarding: mapped.identity.completedOnboarding,
    created: mapped.created,
    userId: mapped.identity.id,
  };
}

export { ensureLocalIdentity };
export type { ClerkIdentityInput, EnsureLocalIdentityDependencies, EnsureLocalIdentityResult };
