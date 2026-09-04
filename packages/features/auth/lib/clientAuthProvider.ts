// biome-ignore-all lint/style/noProcessEnv: Next.js requires direct process.env access to inline public variables.
// biome-ignore-all lint/correctness/noProcessGlobal: Importing node:process prevents Next.js from inlining the value.
import type { AuthProvider } from "./authProvider";

function getClientAuthProvider(
  provider: string | undefined = process.env.NEXT_PUBLIC_AUTH_PROVIDER
): AuthProvider {
  if (provider === "clerk") return "clerk";
  return "nextauth";
}

export { getClientAuthProvider };
