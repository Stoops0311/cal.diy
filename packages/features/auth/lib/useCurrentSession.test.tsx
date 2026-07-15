import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAuth, useSession } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth }));
vi.mock("next-auth/react", () => ({ useSession }));

import type { ConvenioSession } from "./currentSession";
import { useClerkCurrentSession } from "./useCurrentSession";

const session = {
  expires: "2026-07-15T12:00:00.000Z",
  hasValidLicense: true,
  upId: "usr-42",
  user: { email: "person@example.com", id: 42, uuid: "user-uuid" },
} as ConvenioSession;

describe("useClerkCurrentSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(JSON.stringify(session)))
    );
  });

  it("does not request a local session while Clerk is loading", () => {
    useAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined });

    const { result } = renderHook(() => useClerkCurrentSession());

    expect(result.current).toMatchObject({ data: null, status: "loading" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns unauthenticated for a signed-out Clerk session", () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    const { result } = renderHook(() => useClerkCurrentSession());

    expect(result.current).toMatchObject({ data: null, status: "unauthenticated" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the complete local session for a signed-in Clerk user", async () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });

    const { result } = renderHook(() => useClerkCurrentSession());

    await waitFor(() => expect(result.current).toMatchObject({ data: session, status: "authenticated" }));
    expect(fetch).toHaveBeenCalledWith("/api/auth/current-session", { credentials: "same-origin" });
  });

  it("refetches the local projection when update is called", async () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const { result } = renderHook(() => useClerkCurrentSession());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    await expect(act(() => result.current.update())).resolves.toEqual(session);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
