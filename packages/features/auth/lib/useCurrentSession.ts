import { useAuth } from "@clerk/nextjs";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { getClientAuthProvider } from "./authProvider";
import type { ConvenioSession } from "./currentSession";

type CurrentSessionStatus = "authenticated" | "loading" | "unauthenticated";
type CurrentSessionHookResult = {
  data: ConvenioSession | null;
  status: CurrentSessionStatus;
  update: (data?: unknown) => Promise<ConvenioSession | null>;
};

async function fetchCurrentSession(): Promise<ConvenioSession | null> {
  const response = await fetch("/api/auth/current-session", { credentials: "same-origin" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to load the current session");
  return response.json() as Promise<ConvenioSession>;
}

function useClerkCurrentSession(): CurrentSessionHookResult {
  const clerkAuth = useAuth();
  const [data, setData] = useState<ConvenioSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const enabled = clerkAuth.isLoaded && clerkAuth.isSignedIn === true;

  const update = useCallback(async (): Promise<ConvenioSession | null> => {
    if (!enabled) return null;
    const session = await fetchCurrentSession();
    setData(session);
    return session;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    fetchCurrentSession()
      .then((session) => {
        if (active) setData(session);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  let status: CurrentSessionStatus = "loading";
  if (clerkAuth.isLoaded && !clerkAuth.isSignedIn) status = "unauthenticated";
  if (enabled && !isLoading && data) status = "authenticated";
  if (enabled && !isLoading && !data) status = "unauthenticated";

  return { data, status, update };
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
if (getClientAuthProvider() === "clerk") useProviderSession = useClerkCurrentSession;

function useCurrentSession(): CurrentSessionHookResult {
  return useProviderSession();
}

export { fetchCurrentSession, useClerkCurrentSession, useCurrentSession };
export type { CurrentSessionHookResult, CurrentSessionStatus };
