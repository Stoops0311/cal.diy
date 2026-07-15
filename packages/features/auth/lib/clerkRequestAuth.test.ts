import type { NextApiRequest } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { appAuth, authenticateRequest, toAuth } = vi.hoisted(() => ({
  appAuth: vi.fn(),
  authenticateRequest: vi.fn(),
  toAuth: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: appAuth }));
vi.mock("./clerkClient", () => ({
  getClerkBackendClient: () => ({ authenticateRequest }),
}));

import { authenticateClerkRequest } from "./clerkRequestAuth";

describe("authenticateClerkRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toAuth.mockReturnValue({ sessionClaims: { exp: 1_784_116_800 }, userId: "user_pages" });
    authenticateRequest.mockResolvedValue({ isAuthenticated: true, toAuth });
  });

  it("uses Clerk's App Router auth helper when there is no legacy request", async () => {
    appAuth.mockResolvedValue({ sessionClaims: { exp: 1_784_116_800 }, userId: "user_app" });

    await expect(authenticateClerkRequest()).resolves.toEqual({
      expiresAt: 1_784_116_800_000,
      userId: "user_app",
    });
    expect(authenticateRequest).not.toHaveBeenCalled();
  });

  it("verifies Pages and API requests as Clerk session tokens", async () => {
    const { req } = createMocks<NextApiRequest>({
      headers: { cookie: "__session=token", host: "convenio.test", "x-forwarded-proto": "https" },
      method: "GET",
      url: "/api/me",
    });

    await expect(authenticateClerkRequest(req)).resolves.toEqual({
      expiresAt: 1_784_116_800_000,
      userId: "user_pages",
    });
    expect(authenticateRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", url: "https://convenio.test/api/me" }),
      { acceptsToken: "session_token" }
    );
  });

  it("returns null for a signed-out request", async () => {
    authenticateRequest.mockResolvedValue({ isAuthenticated: false });
    const { req } = createMocks<NextApiRequest>();

    await expect(authenticateClerkRequest(req)).resolves.toBeNull();
    expect(toAuth).not.toHaveBeenCalled();
  });
});
