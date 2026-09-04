import { useClerk } from "@clerk/nextjs";
import { signOut as legacySignOut } from "next-auth/react";
import { useCallback } from "react";
import { getClientAuthProvider } from "./clientAuthProvider";

type SignOutOptions = {
  redirectUrl: string;
};

type CurrentAuthActions = {
  signOut: (options: SignOutOptions) => Promise<void>;
};

function useClerkAuthActions(): CurrentAuthActions {
  const clerk = useClerk();
  const signOut = useCallback(
    async ({ redirectUrl }: SignOutOptions): Promise<void> => {
      await clerk.signOut({ redirectUrl });
    },
    [clerk]
  );

  return { signOut };
}

function useLegacyAuthActions(): CurrentAuthActions {
  const signOut = useCallback(async ({ redirectUrl }: SignOutOptions): Promise<void> => {
    await legacySignOut({ callbackUrl: redirectUrl });
  }, []);

  return { signOut };
}

let useProviderAuthActions: () => CurrentAuthActions = useLegacyAuthActions;
if (getClientAuthProvider() === "clerk") {
  useProviderAuthActions = useClerkAuthActions;
}

function useCurrentAuthActions(): CurrentAuthActions {
  return useProviderAuthActions();
}

export { useClerkAuthActions, useCurrentAuthActions, useLegacyAuthActions };
export type { CurrentAuthActions, SignOutOptions };
