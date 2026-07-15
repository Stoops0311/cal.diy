import process from "node:process";
import { type ClerkClient, createClerkClient } from "@clerk/backend";
import { getAuthProvider } from "./authProvider";

type AuthEnvironment = Record<string, string | undefined>;

function getClerkBackendClient(env: AuthEnvironment = process.env): ClerkClient {
  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.CLERK_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required when Clerk is enabled");
  }
  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required when Clerk is enabled");
  }

  return createClerkClient({ publishableKey, secretKey });
}

export { getAuthProvider, getClerkBackendClient };
export type { AuthProvider } from "./authProvider";
