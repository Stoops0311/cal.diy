import { auth } from "@clerk/nextjs/server";
import type { GetServerSidePropsContext } from "next";
import { getClerkBackendClient } from "./clerkClient";

type ClerkRequestAuth = {
  expiresAt: number | null;
  organizationId: string | null;
  userId: string;
};

function getExpiration(sessionClaims: Record<string, unknown> | null | undefined): number | null {
  const expiration = sessionClaims?.exp;
  if (typeof expiration !== "number") return null;
  return expiration * 1000;
}

type ClerkCompatibleRequest = GetServerSidePropsContext["req"];

function toWebRequest(req: ClerkCompatibleRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const forwardedProtocol = req.headers["x-forwarded-proto"];
  let protocol = forwardedProtocol;
  if (Array.isArray(protocol)) protocol = protocol[0];
  protocol ??= "http";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  return new Request(url, { headers, method: req.method ?? "GET" });
}

async function authenticateClerkRequest(req?: ClerkCompatibleRequest): Promise<ClerkRequestAuth | null> {
  if (!req) {
    const authState = await auth();
    if (!authState.userId) return null;
    return {
      expiresAt: getExpiration(authState.sessionClaims),
      organizationId: authState.orgId ?? null,
      userId: authState.userId,
    };
  }

  const requestState = await getClerkBackendClient().authenticateRequest(toWebRequest(req), {
    acceptsToken: "session_token",
  });
  if (!requestState.isAuthenticated) return null;

  const authState = requestState.toAuth();
  if (!authState.userId) return null;
  return {
    expiresAt: getExpiration(authState.sessionClaims),
    organizationId: authState.orgId ?? null,
    userId: authState.userId,
  };
}

export { authenticateClerkRequest, toWebRequest };
export type { ClerkRequestAuth };
