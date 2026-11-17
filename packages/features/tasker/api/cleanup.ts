import { isCronSecretBearer } from "@calcom/lib/server/cronAuth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import tasker from "..";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isCronSecretBearer(authHeader)) {
    return new Response("Unauthorized", { status: 401 });
  }
  await tasker.cleanup();
  return NextResponse.json({ success: true });
}
