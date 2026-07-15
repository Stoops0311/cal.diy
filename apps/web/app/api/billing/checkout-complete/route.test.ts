import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("billing checkout completion", () => {
  it("returns a no-store browser handoff to the protected billing page", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/billing/checkout-complete?checkout_id=checkout_123"
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain(
      'window.location.replace("/settings/billing?checkout_id=checkout_123")'
    );
  });

  it.each([
    "http://localhost:3000/api/billing/checkout-complete",
    "http://localhost:3000/api/billing/checkout-complete?checkout_id=invalid%20id",
  ])("rejects a missing or malformed checkout id", async (url) => {
    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(400);
  });
});
