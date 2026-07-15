import { describe, expect, it, vi } from "vitest";
import type { ClerkSessionProjectionDependencies, ConvenioSession } from "./currentSession";
import { projectClerkSession } from "./currentSession";

const session = {
  expires: "2026-07-15T12:00:00.000Z",
  hasValidLicense: true,
  upId: "usr-42",
  user: { email: "person@example.com", id: 42, uuid: "user-uuid" },
} as ConvenioSession;

function createDependencies(
  overrides: Partial<ClerkSessionProjectionDependencies> = {}
): ClerkSessionProjectionDependencies {
  return {
    ensureIdentity: vi.fn().mockResolvedValue({ userId: 42 }),
    findMappedUser: vi.fn().mockResolvedValue(null),
    getClerkUser: vi.fn().mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: "person@example.com",
          id: "email_primary",
          verification: { status: "verified" },
        },
      ],
      externalId: null,
      firstName: "Pat",
      imageUrl: "https://images.example/avatar.png",
      lastName: "Lee",
      primaryEmailAddressId: "email_primary",
      username: "pat",
    }),
    getLocalSession: vi.fn().mockResolvedValue(session),
    ...overrides,
  };
}

describe("projectClerkSession", () => {
  it("uses an existing unlocked mapping without fetching Clerk", async () => {
    const dependencies = createDependencies({
      findMappedUser: vi.fn().mockResolvedValue({ id: 7, locked: false }),
    });

    await expect(
      projectClerkSession({ clerkUserId: "user_clerk", expiresAt: 1_784_116_800_000 }, dependencies)
    ).resolves.toBe(session);
    expect(dependencies.getClerkUser).not.toHaveBeenCalled();
    expect(dependencies.getLocalSession).toHaveBeenCalledWith({
      expiresAt: 1_784_116_800_000,
      token: { sub: "7" },
      userId: 7,
    });
  });

  it("rejects a locked local mapping", async () => {
    const dependencies = createDependencies({
      findMappedUser: vi.fn().mockResolvedValue({ id: 7, locked: true }),
    });

    await expect(
      projectClerkSession({ clerkUserId: "user_clerk", expiresAt: null }, dependencies)
    ).resolves.toBeNull();
    expect(dependencies.getClerkUser).not.toHaveBeenCalled();
    expect(dependencies.getLocalSession).not.toHaveBeenCalled();
  });

  it("provisions an unmapped verified Clerk identity", async () => {
    const dependencies = createDependencies();

    await expect(
      projectClerkSession({ clerkUserId: "user_clerk", expiresAt: 1_784_116_800_000 }, dependencies)
    ).resolves.toBe(session);
    expect(dependencies.ensureIdentity).toHaveBeenCalledWith({
      avatarUrl: "https://images.example/avatar.png",
      clerkUserId: "user_clerk",
      emailVerified: true,
      externalId: null,
      name: "Pat Lee",
      primaryEmail: "person@example.com",
      username: "pat",
    });
  });

  it("does not provision a Clerk user without a primary email", async () => {
    const dependencies = createDependencies({
      getClerkUser: vi.fn().mockResolvedValue({ emailAddresses: [], primaryEmailAddressId: null }),
    });

    await expect(
      projectClerkSession({ clerkUserId: "user_clerk", expiresAt: null }, dependencies)
    ).resolves.toBeNull();
    expect(dependencies.ensureIdentity).not.toHaveBeenCalled();
  });
});
