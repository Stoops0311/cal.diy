import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthProvider } = vi.hoisted(() => ({ getAuthProvider: vi.fn() }));
vi.mock("@calcom/features/auth/lib/authProvider", () => ({ getAuthProvider }));

import { legacyAuthOnly } from "./legacyAuthOnly";

describe("legacyAuthOnly", () => {
  const route = vi.fn(async () => new Response("handled", { status: 200 }));
  const request = () => new NextRequest("http://localhost/api/auth/setup", { method: "POST" });

  beforeEach(() => vi.clearAllMocks());

  it("hides local-password routes while Clerk owns authentication", async () => {
    getAuthProvider.mockReturnValue("clerk");

    const response = await legacyAuthOnly(route)(request());

    expect(response.status).toBe(404);
    expect(route).not.toHaveBeenCalled();
  });

  it("keeps the routes for the NextAuth rollback path", async () => {
    getAuthProvider.mockReturnValue("nextauth");

    const response = await legacyAuthOnly(route)(request());

    expect(response.status).toBe(200);
    expect(route).toHaveBeenCalledOnce();
  });
});
