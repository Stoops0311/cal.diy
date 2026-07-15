import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthProvider, nextAuth } = vi.hoisted(() => ({
  getAuthProvider: vi.fn(),
  nextAuth: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/authProvider", () => ({ getAuthProvider }));
vi.mock("next-auth", () => ({ default: nextAuth }));

import handler from "./[...nextauth]";

describe("legacy NextAuth route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is unavailable while Clerk is active", async () => {
    getAuthProvider.mockReturnValue("clerk");
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(nextAuth).not.toHaveBeenCalled();
  });

  it("preserves the rollback handler while NextAuth is active", async () => {
    getAuthProvider.mockReturnValue("nextauth");
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>();

    await handler(req, res);

    expect(nextAuth).toHaveBeenCalledOnce();
  });
});
