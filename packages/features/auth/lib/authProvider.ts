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

export { getAuthProvider };
export type { AuthProvider };
