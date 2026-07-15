import type { NextRequest } from "next/server";

const checkoutIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function GET(request: NextRequest): Response {
  const checkoutId = request.nextUrl.searchParams.get("checkout_id")?.trim();
  if (!checkoutId || !checkoutIdPattern.test(checkoutId)) {
    return Response.json({ error: "Invalid checkout id" }, { status: 400 });
  }

  const destination = `/settings/billing?checkout_id=${encodeURIComponent(checkoutId)}`;
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Checkout complete</title></head><body><script>window.location.replace(${JSON.stringify(destination)})</script><noscript><a href="${destination}">Continue to billing</a></noscript></body></html>`;
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
    },
  });
}
