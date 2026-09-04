import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConvenioSession, CurrentSessionDependencies } from "./currentSession";
import { getCurrentSession, getCurrentSessionFromRequest } from "./currentSession";

const session = {
  expires: "2026-07-15T12:00:00.000Z",
  hasValidLicense: true,
  upId: "usr-42",
  user: { email: "person@example.com", id: 42, uuid: "user-uuid" },
} as ConvenioSession;

function createDependencies(overrides: Partial<CurrentSessionDependencies> = {}): CurrentSessionDependencies {
  return {
    authenticateClerk: vi
      .fn()
      .mockResolvedValue({ expiresAt: 1784116800000, organizationId: "org_clerk", userId: "user_clerk" }),
    getLegacySession: vi.fn().mockResolvedValue(session),
    getProvider: vi.fn().mockReturnValue("clerk"),
    getSessionForClerkUser: vi.fn().mockResolvedValue(session),
    ...overrides,
  };
}

describe("getCurrentSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to the legacy session implementation during rollback", async () => {
    const dependencies = createDependencies({ getProvider: () => "nextauth" });
    const options = { req: { headers: {} } };

    await expect(getCurrentSession(options, dependencies)).resolves.toBe(session);
    expect(dependencies.getLegacySession).toHaveBeenCalledWith(options);
    expect(dependencies.authenticateClerk).not.toHaveBeenCalled();
  });

  it("returns null for an anonymous Clerk request without trying NextAuth", async () => {
    const dependencies = createDependencies({ authenticateClerk: vi.fn().mockResolvedValue(null) });

    await expect(getCurrentSession({ req: { headers: {} } }, dependencies)).resolves.toBeNull();
    expect(dependencies.getLegacySession).not.toHaveBeenCalled();
    expect(dependencies.getSessionForClerkUser).not.toHaveBeenCalled();
  });

  it("projects the authenticated Clerk identity into the local session", async () => {
    const dependencies = createDependencies();

    await expect(getCurrentSession({ req: { headers: {} } }, dependencies)).resolves.toBe(session);
    expect(dependencies.getSessionForClerkUser).toHaveBeenCalledWith({
      clerkUserId: "user_clerk",
      expiresAt: 1784116800000,
      organizationId: "org_clerk",
    });
  });

  it("returns null when the mapped local account is unavailable or locked", async () => {
    const dependencies = createDependencies({ getSessionForClerkUser: vi.fn().mockResolvedValue(null) });

    await expect(getCurrentSession({ req: { headers: {} } }, dependencies)).resolves.toBeNull();
    expect(dependencies.getLegacySession).not.toHaveBeenCalled();
  });

  it("never falls back to NextAuth when Clerk authentication fails", async () => {
    const failure = new Error("invalid Clerk request");
    const dependencies = createDependencies({ authenticateClerk: vi.fn().mockRejectedValue(failure) });

    await expect(getCurrentSession({ req: { headers: {} } }, dependencies)).rejects.toBe(failure);
    expect(dependencies.getLegacySession).not.toHaveBeenCalled();
  });
});

describe("getCurrentSessionFromRequest", () => {
  it("authenticates the supplied Pages or API request", async () => {
    const dependencies = createDependencies();
    const req = { headers: {} };

    await expect(getCurrentSessionFromRequest(req, undefined, dependencies)).resolves.toBe(session);
    expect(dependencies.authenticateClerk).toHaveBeenCalledWith(req);
  });
});
