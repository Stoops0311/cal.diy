import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { clerkSignOut, legacySignOut, useClerk } = vi.hoisted(() => ({
  clerkSignOut: vi.fn(),
  legacySignOut: vi.fn(),
  useClerk: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useClerk }));
vi.mock("next-auth/react", () => ({ signOut: legacySignOut }));

import { useClerkAuthActions, useLegacyAuthActions } from "./useCurrentAuthActions";

describe("current auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClerk.mockReturnValue({ signOut: clerkSignOut });
  });

  it("signs out through Clerk and preserves the redirect", async () => {
    const { result } = renderHook(() => useClerkAuthActions());

    await act(() => result.current.signOut({ redirectUrl: "/auth/logout" }));

    expect(clerkSignOut).toHaveBeenCalledWith({ redirectUrl: "/auth/logout" });
  });

  it("signs out through NextAuth and translates the redirect for rollback", async () => {
    const { result } = renderHook(() => useLegacyAuthActions());

    await act(() => result.current.signOut({ redirectUrl: "/auth/logout" }));

    expect(legacySignOut).toHaveBeenCalledWith({ callbackUrl: "/auth/logout" });
  });
});
