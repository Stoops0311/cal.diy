import { describe, expect, it, vi } from "vitest";
import {
  buildClerkUserParams,
  formatImportFailure,
  type ImportDependencies,
  type LocalUserForClerkImport,
  migrateUserToClerk,
  parseImportMode,
} from "./importUsersToClerk";

function localUser(overrides: Partial<LocalUserForClerkImport> = {}): LocalUserForClerkImport {
  return {
    backupCodes: null,
    clerkUserId: null,
    createdDate: new Date("2025-01-02T03:04:05.000Z"),
    email: "person@example.com",
    emailVerified: new Date("2025-01-02T03:04:05.000Z"),
    id: 42,
    locked: false,
    name: "Pat Lee",
    password: { hash: "$2b$10$abcdefghijklmnopqrstuvwxyz012345678901234567890123456" },
    twoFactorEnabled: false,
    twoFactorSecret: null,
    username: "pat_lee",
    ...overrides,
  };
}

function dependencies(overrides: Partial<ImportDependencies> = {}): ImportDependencies {
  return {
    createClerkUser: vi.fn().mockResolvedValue({ id: "user_new" }),
    decrypt: vi.fn((value: string) => value),
    findByEmail: vi.fn().mockResolvedValue([]),
    findByExternalId: vi.fn().mockResolvedValue([]),
    mapLocalUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("parseImportMode", () => {
  it("requires exactly one explicit mode", () => {
    expect(parseImportMode(["--dry-run"])).toBe("dry-run");
    expect(parseImportMode(["--apply"])).toBe("apply");
    expect(() => parseImportMode([])).toThrow("Exactly one of --dry-run or --apply is required");
    expect(() => parseImportMode(["--dry-run", "--apply"])).toThrow(
      "Exactly one of --dry-run or --apply is required"
    );
  });
});

describe("buildClerkUserParams", () => {
  it("migrates a bcrypt password without exposing plaintext", () => {
    expect(buildClerkUserParams(localUser(), vi.fn())).toMatchObject({
      emailAddress: ["person@example.com"],
      externalId: "42",
      passwordDigest: expect.stringMatching(/^\$2b\$/),
      passwordHasher: "bcrypt",
    });
  });

  it("omits a username Clerk cannot accept", () => {
    expect(buildClerkUserParams(localUser({ username: "bad username!" }), vi.fn())).not.toHaveProperty(
      "username"
    );
  });

  it("allows an OAuth-only user to establish a Clerk sign-in method", () => {
    expect(buildClerkUserParams(localUser({ password: null }), vi.fn())).toMatchObject({
      skipPasswordRequirement: true,
    });
  });

  it("keeps a locked local user unable to sign in", () => {
    expect(buildClerkUserParams(localUser({ locked: true }), vi.fn())).toMatchObject({ banned: true });
  });

  it("migrates decrypted TOTP and remaining backup codes", () => {
    const decrypt = vi
      .fn()
      .mockReturnValueOnce("totp-secret")
      .mockReturnValueOnce(JSON.stringify(["code-one", null, "code-two"]));

    expect(
      buildClerkUserParams(
        localUser({
          backupCodes: "encrypted-codes",
          twoFactorEnabled: true,
          twoFactorSecret: "encrypted-totp",
        }),
        decrypt
      )
    ).toMatchObject({ backupCodes: ["code-one", "code-two"], totpSecret: "totp-secret" });
  });

  it("rejects unsupported password hashes", () => {
    expect(() => buildClerkUserParams(localUser({ password: { hash: "not-bcrypt" } }), vi.fn())).toThrow(
      "UNSUPPORTED_PASSWORD_HASH"
    );
  });
});

describe("migrateUserToClerk", () => {
  it("is idempotent for an already mapped local user", async () => {
    const deps = dependencies();

    await expect(
      migrateUserToClerk(localUser({ clerkUserId: "user_existing" }), "apply", deps)
    ).resolves.toEqual({
      action: "already-mapped",
      userId: 42,
    });
    expect(deps.createClerkUser).not.toHaveBeenCalled();
  });

  it("maps a deterministic external-id match without creating a duplicate", async () => {
    const deps = dependencies({ findByExternalId: vi.fn().mockResolvedValue([{ id: "user_existing" }]) });

    await expect(migrateUserToClerk(localUser(), "apply", deps)).resolves.toEqual({
      action: "mapped",
      userId: 42,
    });
    expect(deps.mapLocalUser).toHaveBeenCalledWith(42, "user_existing");
    expect(deps.createClerkUser).not.toHaveBeenCalled();
  });

  it("does not write during a dry run", async () => {
    const deps = dependencies();

    await expect(migrateUserToClerk(localUser(), "dry-run", deps)).resolves.toEqual({
      action: "would-create",
      userId: 42,
    });
    expect(deps.createClerkUser).not.toHaveBeenCalled();
    expect(deps.mapLocalUser).not.toHaveBeenCalled();
  });

  it("creates and maps a new Clerk user during apply", async () => {
    const deps = dependencies();

    await expect(migrateUserToClerk(localUser(), "apply", deps)).resolves.toEqual({
      action: "created",
      userId: 42,
    });
    expect(deps.mapLocalUser).toHaveBeenCalledWith(42, "user_new");
  });
});

describe("formatImportFailure", () => {
  it("redacts secrets and personal data", () => {
    expect(
      formatImportFailure({
        code: "CLERK_CREATE_FAILED",
        email: "hidden@example.com",
        secret: "hidden",
        userId: 7,
      })
    ).toEqual({ code: "CLERK_CREATE_FAILED", userId: 7 });
  });
});
