import { useAuth, useClerk } from "@clerk/nextjs";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { getClientAuthProvider } from "./clientAuthProvider";
import type { ConvenioSession } from "./currentSession";

type CurrentSessionStatus = "authenticated" | "loading" | "unauthenticated";
type CurrentSessionHookResult = {
  data: ConvenioSession | null;
  status: CurrentSessionStatus;
  update: (data?: unknown) => Promise<ConvenioSession | null>;
};

function isClerkOrganizationUpdate(data: unknown): data is { clerkOrganizationId: string | null } {
  if (typeof data !== "object" || data === null || !("clerkOrganizationId" in data)) return false;
  return data.clerkOrganizationId === null || typeof data.clerkOrganizationId === "string";
}

async function fetchCurrentSession(): Promise<ConvenioSession | null> {
  const response = await fetch("/api/auth/current-session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to load the current session");
  return response.json() as Promise<ConvenioSession>;
}

function useClerkCurrentSession(): CurrentSessionHookResult {
  const clerkAuth = useAuth();
  const clerk = useClerk();
  // A null projection means the local session request has not resolved yet, which is
  // distinct from a resolved request that returned no session. Collapsing the two makes
  // a signed-in user look unauthenticated on first render and bounces them to /auth/login.
  const [projection, setProjection] = useState<{ session: ConvenioSession | null } | null>(null);
  const enabled = clerkAuth.isLoaded && clerkAuth.isSignedIn === true;

  const update = useCallback(
    async (data?: unknown): Promise<ConvenioSession | null> => {
      if (!enabled) return null;
      if (isClerkOrganizationUpdate(data)) {
        await clerk.setActive({ organization: data.clerkOrganizationId });
      }
      const session = await fetchCurrentSession();
      setProjection({ session });
      return session;
    },
    [clerk, enabled]
  );

  useEffect(() => {
    setProjection(null);
    if (!enabled) return;

    let active = true;
    fetchCurrentSession()
      .then((session) => {
        if (active) setProjection({ session });
      })
      .catch(() => {
        // A failed request tells us nothing about the user, so stay loading rather than
        // redirect to login on a transient network error.
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  let status: CurrentSessionStatus = "loading";
  if (clerkAuth.isLoaded && !clerkAuth.isSignedIn) status = "unauthenticated";
  else if (enabled && projection) status = projection.session ? "authenticated" : "unauthenticated";

  return { data: projection?.session ?? null, status, update };
}

function useLegacyCurrentSession(): CurrentSessionHookResult {
  const legacySession = useSession();
  return {
    data: legacySession.data,
    status: legacySession.status,
    update: legacySession.update,
  };
}

let useProviderSession: () => CurrentSessionHookResult = useLegacyCurrentSession;
if (getClientAuthProvider() === "clerk") {
  useProviderSession = useClerkCurrentSession;
}

function useCurrentSession(): CurrentSessionHookResult {
  return useProviderSession();
}

export { fetchCurrentSession, useClerkCurrentSession, useCurrentSession };
export type { CurrentSessionHookResult, CurrentSessionStatus };
