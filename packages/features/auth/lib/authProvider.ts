import process from "node:process";

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

export { getAuthProvider, getClientAuthProvider };
export type { AuthProvider };
