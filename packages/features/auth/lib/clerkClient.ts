import process from "node:process";
import { type ClerkClient, createClerkClient } from "@clerk/backend";
import { getAuthProvider, getClientAuthProvider } from "./authProvider";

type AuthEnvironment = Record<string, string | undefined>;

function getClerkBackendClient(env: AuthEnvironment = process.env): ClerkClient {
  const secretKey = env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required when Clerk is enabled");
  }

  return createClerkClient({ secretKey });
}

export { getAuthProvider, getClerkBackendClient, getClientAuthProvider };
export type { AuthProvider } from "./authProvider";
