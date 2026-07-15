import process from "node:process";
import { type ClerkClient, createClerkClient } from "@clerk/backend";

type AuthProvider = "nextauth" | "clerk";

type AuthEnvironment = Record<string, string | undefined>;

function getAuthProvider(env: AuthEnvironment = process.env): AuthProvider {
  const provider = env.AUTH_PROVIDER ?? "nextauth";

  if (provider !== "nextauth" && provider !== "clerk") {
    throw new Error("AUTH_PROVIDER must be nextauth or clerk");
  }

  return provider;
}

function getClientAuthProvider(env: AuthEnvironment = process.env): AuthProvider {
  return getAuthProvider({ AUTH_PROVIDER: env.NEXT_PUBLIC_AUTH_PROVIDER });
}

function getClerkBackendClient(env: AuthEnvironment = process.env): ClerkClient {
  const secretKey = env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required when Clerk is enabled");
  }

  return createClerkClient({ secretKey });
}

export { getAuthProvider, getClerkBackendClient, getClientAuthProvider };
export type { AuthProvider };
