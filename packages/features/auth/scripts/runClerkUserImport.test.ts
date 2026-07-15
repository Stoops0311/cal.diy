import { describe, expect, it, vi } from "vitest";
import type { LocalUserForClerkImport } from "./importUsersToClerk";
import { parseFixtureUserId, runClerkUserImport } from "./runClerkUserImport";

function user(id: number): LocalUserForClerkImport {
  return {
    backupCodes: null,
    clerkUserId: null,
    createdDate: new Date("2025-01-01T00:00:00.000Z"),
    email: `user-${id}@example.com`,
    emailVerified: new Date("2025-01-01T00:00:00.000Z"),
    id,
    locked: false,
    name: null,
    password: null,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    username: null,
  };
}

async function* users(): AsyncGenerator<LocalUserForClerkImport> {
  yield user(1);
  yield user(2);
  yield user(3);
}

describe("runClerkUserImport", () => {
  it("continues after a per-user failure and returns only sanitized identifiers", async () => {
    const migrate = vi
      .fn()
      .mockResolvedValueOnce({ action: "created", userId: 1 })
      .mockRejectedValueOnce(Object.assign(new Error("secret API response"), { code: "CLERK_CREATE_FAILED" }))
      .mockResolvedValueOnce({ action: "already-mapped", userId: 3 });

    await expect(runClerkUserImport("apply", users(), migrate)).resolves.toEqual({
      failures: [{ code: "CLERK_CREATE_FAILED", userId: 2 }],
      summary: { "already-mapped": 1, created: 1, failed: 1, mapped: 0, "would-create": 0, "would-map": 0 },
    });
  });
});

describe("parseFixtureUserId", () => {
  it("allows a fixture filter outside production", () => {
    expect(parseFixtureUserId(["--user-id=42"], "development")).toBe(42);
  });

  it("rejects fixture filters in production", () => {
    expect(() => parseFixtureUserId(["--user-id=42"], "production")).toThrow(
      "--user-id is unavailable in production"
    );
  });
});
