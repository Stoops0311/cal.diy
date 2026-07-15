import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentSession } = vi.hoisted(() => ({ getCurrentSession: vi.fn() }));

vi.mock("@calcom/features/auth/lib/currentSession", () => ({ getCurrentSession }));

import currentSessionHandler from "./current-session";

describe("currentSessionHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the projected session", async () => {
    getCurrentSession.mockResolvedValue({ upId: "usr-42", user: { id: 42 } });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>();

    await currentSessionHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ upId: "usr-42", user: { id: 42 } });
    expect(getCurrentSession).toHaveBeenCalledWith({ req });
  });

  it("returns unauthorized when no usable local session exists", async () => {
    getCurrentSession.mockResolvedValue(null);
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>();

    await currentSessionHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toBeNull();
  });
});
