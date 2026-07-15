import type { AuthProvider } from "./authProvider";

function getClientAuthProvider(provider: string | undefined): AuthProvider {
  if (provider === "clerk") return "clerk";
  return "nextauth";
}

export { getClientAuthProvider };
