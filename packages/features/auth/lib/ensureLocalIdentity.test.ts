import { ErrorCode } from "@calcom/lib/errorCodes";
import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClerkIdentityInput,
  type EnsureLocalIdentityDependencies,
  ensureLocalIdentity,
} from "./ensureLocalIdentity";

const createdUserIds: number[] = [];

const identity = (overrides: Partial<ClerkIdentityInput> = {}): ClerkIdentityInput => {
  const suffix = crypto.randomUUID();
  return {
    avatarUrl: null,
    clerkUserId: `user_${suffix}`,
    emailVerified: true,
    externalId: null,
    name: "Ada Lovelace",
    primaryEmail: `ada-${suffix}@example.com`,
    username: `ada-${suffix}`,
    ...overrides,
  };
};

const dependencies = (): EnsureLocalIdentityDependencies => ({
  updateClerkExternalId: vi.fn().mockResolvedValue(undefined),
});

async function createLocalUser(
  data: Partial<{
    clerkUserId: string;
    email: string;
    locked: boolean;
    username: string;
  }> = {}
): Promise<{
  clerkUserId: string | null;
  completedOnboarding: boolean;
  email: string;
  id: number;
  locked: boolean;
  username: string | null;
}> {
  const user = await prisma.user.create({
    data: {
      email: data.email ?? `local-${crypto.randomUUID()}@example.com`,
      username: data.username,
      clerkUserId: data.clerkUserId,
      locked: data.locked,
    },
    select: {
      clerkUserId: true,
      completedOnboarding: true,
      email: true,
      id: true,
      locked: true,
      username: true,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

describe("ensureLocalIdentity", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    if (createdUserIds.length === 0) return;

    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds.splice(0) } },
    });
  });

  it("rejects an unverified primary email", async () => {
    await expect(
      ensureLocalIdentity(identity({ emailVerified: false }), dependencies())
    ).rejects.toMatchObject({ code: ErrorCode.ClerkEmailUnverified });
  });

  it("resolves an existing user by Clerk user id", async () => {
    const clerkUserId = `user_${crypto.randomUUID()}`;
    const localUser = await createLocalUser({ clerkUserId });

    await expect(ensureLocalIdentity(identity({ clerkUserId }), dependencies())).resolves.toMatchObject({
      created: false,
      userId: localUser.id,
    });
  });

  it("resolves an existing user by numeric external id", async () => {
    const localUser = await createLocalUser();
    const input = identity({ externalId: String(localUser.id), primaryEmail: localUser.email });

    await expect(ensureLocalIdentity(input, dependencies())).resolves.toMatchObject({
      created: false,
      userId: localUser.id,
    });
  });

  it("rejects a non-numeric external id", async () => {
    await expect(
      ensureLocalIdentity(identity({ externalId: "legacy-user" }), dependencies())
    ).rejects.toMatchObject({ code: ErrorCode.ClerkExternalIdInvalid });
  });

  it("rejects Clerk identifiers that resolve to different users", async () => {
    const clerkUserId = `user_${crypto.randomUUID()}`;
    await createLocalUser({ clerkUserId });
    const externalUser = await createLocalUser();

    await expect(
      ensureLocalIdentity(identity({ clerkUserId, externalId: String(externalUser.id) }), dependencies())
    ).rejects.toMatchObject({ code: ErrorCode.ClerkIdentityAmbiguous });
  });

  it("rejects an external id already mapped to another Clerk user", async () => {
    const localUser = await createLocalUser({ clerkUserId: `user_${crypto.randomUUID()}` });

    await expect(
      ensureLocalIdentity(identity({ externalId: String(localUser.id) }), dependencies())
    ).rejects.toMatchObject({ code: ErrorCode.ClerkIdentityAmbiguous });
  });

  it("resolves an existing user by verified email", async () => {
    const localUser = await createLocalUser({ email: `Case-${crypto.randomUUID()}@example.com` });
    const input = identity({ primaryEmail: localUser.email.toLowerCase() });

    await expect(ensureLocalIdentity(input, dependencies())).resolves.toMatchObject({
      created: false,
      userId: localUser.id,
    });
  });

  it("rejects a locked matched user", async () => {
    const clerkUserId = `user_${crypto.randomUUID()}`;
    await createLocalUser({ clerkUserId, locked: true });

    await expect(ensureLocalIdentity(identity({ clerkUserId }), dependencies())).rejects.toMatchObject({
      code: ErrorCode.LocalAccountLocked,
    });
  });

  it("rejects an ambiguous case-insensitive email match", async () => {
    const suffix = crypto.randomUUID();
    await createLocalUser({ email: `Ambiguous-${suffix}@example.com` });
    await createLocalUser({ email: `ambiguous-${suffix}@example.com` });

    await expect(
      ensureLocalIdentity(identity({ primaryEmail: `AMBIGUOUS-${suffix}@example.com` }), dependencies())
    ).rejects.toMatchObject({ code: ErrorCode.ClerkIdentityAmbiguous });
  });

  it("rejects a verified email already mapped to another Clerk user", async () => {
    const localUser = await createLocalUser({ clerkUserId: `user_${crypto.randomUUID()}` });

    await expect(
      ensureLocalIdentity(identity({ primaryEmail: localUser.email }), dependencies())
    ).rejects.toMatchObject({ code: ErrorCode.ClerkIdentityAmbiguous });
  });

  it("creates one incomplete local user and repairs Clerk externalId", async () => {
    const input = identity();
    const deps = dependencies();

    const result = await ensureLocalIdentity(input, deps);
    createdUserIds.push(result.userId);

    expect(result).toEqual({ completedOnboarding: false, created: true, userId: result.userId });
    expect(deps.updateClerkExternalId).toHaveBeenCalledWith(input.clerkUserId, String(result.userId));
    await expect(
      prisma.user.findUnique({
        where: { id: result.userId },
        select: { clerkUserId: true, email: true, username: true },
      })
    ).resolves.toMatchObject({
      clerkUserId: input.clerkUserId,
      email: input.primaryEmail,
      username: input.username,
    });
  });

  it("suffixes a username that is already in use", async () => {
    const username = `ada-${crypto.randomUUID()}`;
    await createLocalUser({ username });
    const input = identity({ username });
    const result = await ensureLocalIdentity(input, dependencies());
    createdUserIds.push(result.userId);

    await expect(
      prisma.user.findUnique({ where: { id: result.userId }, select: { username: true } })
    ).resolves.toEqual({ username: `${username}-2` });
  });

  it("returns a sanitized error when Clerk externalId repair fails", async () => {
    const deps = dependencies();
    const input = identity();
    vi.mocked(deps.updateClerkExternalId).mockRejectedValue(new Error("provider response with secret"));

    await expect(ensureLocalIdentity(input, deps)).rejects.toMatchObject({
      code: ErrorCode.ClerkExternalIdUpdateFailed,
      message: "Unable to update Clerk externalId",
    });

    const created = await prisma.user.findUnique({
      where: { clerkUserId: input.clerkUserId },
      select: { id: true },
    });
    if (created) createdUserIds.push(created.id);
  });

  it("is idempotent when provisioning is retried", async () => {
    const input = identity();
    const deps = dependencies();

    const first = await ensureLocalIdentity(input, deps);
    createdUserIds.push(first.userId);
    const second = await ensureLocalIdentity(input, deps);

    expect(second).toEqual({ ...first, created: false });
    expect(
      await prisma.user.count({
        where: { clerkUserId: input.clerkUserId },
      })
    ).toBe(1);
  });

  it("retries a unique constraint collision while provisioning", async () => {
    const input = identity();
    const collision = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const transaction = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(collision);

    const result = await ensureLocalIdentity(input, dependencies());
    createdUserIds.push(result.userId);

    expect(result.created).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("recovers when two requests provision the same Clerk user concurrently", async () => {
    const input = identity();
    const results = await Promise.allSettled([
      ensureLocalIdentity(input, dependencies()),
      ensureLocalIdentity(input, dependencies()),
    ]);
    const created = await prisma.user.findUnique({
      where: { clerkUserId: input.clerkUserId },
      select: { id: true },
    });
    if (created) createdUserIds.push(created.id);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(new Set(results.map((result) => result.status === "fulfilled" && result.value.userId)).size).toBe(
      1
    );
  });
});
