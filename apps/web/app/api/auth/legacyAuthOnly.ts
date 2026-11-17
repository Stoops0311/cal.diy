import { getAuthProvider } from "@calcom/features/auth/lib/authProvider";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Under Clerk these local-password routes are dead weight and dangerous: Clerk later links a sign-in to an
// existing row by verified email, so a row pre-created here (or a first ADMIN minted by /setup on an empty
// database) would be inherited by whoever owns that address in Clerk.
export function legacyAuthOnly<Rest extends unknown[]>(
  route: (req: NextRequest, ...rest: Rest) => Promise<Response>
) {
  return async (req: NextRequest, ...rest: Rest): Promise<Response> => {
    if (getAuthProvider() === "clerk") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return route(req, ...rest);
  };
}
