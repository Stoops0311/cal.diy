import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteClerkUser, deleteLocalUser, findUnique, getAuthProvider } = vi.hoisted(() => ({
  deleteClerkUser: vi.fn(),
  deleteLocalUser: vi.fn(),
  findUnique: vi.fn(),
  getAuthProvider: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/clerkClient", () => ({
  getAuthProvider,
  getClerkBackendClient: () => ({ users: { deleteUser: deleteClerkUser } }),
}));
vi.mock("@calcom/features/users/lib/deleteUser", () => ({ deleteUser: deleteLocalUser }));
vi.mock("@calcom/prisma", () => ({ prisma: { user: { findUnique } } }));

import { IdentityProvider } from "@calcom/prisma/enums";
import { deleteMeWithoutPasswordHandler } from "./deleteMeWithoutPassword.handler";

describe("deleteMeWithoutPasswordHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthProvider.mockReturnValue("clerk");
    findUnique.mockResolvedValue({
      clerkUserId: "user_clerk",
      email: "person@example.com",
      id: 7,
      identityProvider: IdentityProvider.CAL,
      metadata: null,
      twoFactorEnabled: true,
    });
  });

  it("deletes the Clerk identity before cleaning up the local user", async () => {
    const calls: string[] = [];
    deleteClerkUser.mockImplementation(async () => calls.push("clerk"));
    deleteLocalUser.mockImplementation(async () => calls.push("local"));

    await deleteMeWithoutPasswordHandler({
      ctx: { user: { email: "person@example.com", id: 7 } } as Parameters<
        typeof deleteMeWithoutPasswordHandler
      >[0]["ctx"],
    });

    expect(calls).toEqual(["clerk", "local"]);
  });

  it("keeps local data when Clerk identity deletion fails", async () => {
    deleteClerkUser.mockRejectedValue(new Error("Clerk unavailable"));

    await expect(
      deleteMeWithoutPasswordHandler({
        ctx: { user: { email: "person@example.com", id: 7 } } as Parameters<
          typeof deleteMeWithoutPasswordHandler
        >[0]["ctx"],
      })
    ).rejects.toThrow("Clerk unavailable");
    expect(deleteLocalUser).not.toHaveBeenCalled();
  });
});
