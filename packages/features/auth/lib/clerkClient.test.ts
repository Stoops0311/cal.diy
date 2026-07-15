import { describe, expect, it } from "vitest";
import { getAuthProvider, getClerkBackendClient, getClientAuthProvider } from "./clerkClient";

describe("getAuthProvider", () => {
  it.each(["nextauth", "clerk"] as const)("accepts %s", (provider) => {
    expect(getAuthProvider({ AUTH_PROVIDER: provider })).toBe(provider);
  });

  it("defaults to nextauth", () => {
    expect(getAuthProvider({})).toBe("nextauth");
  });

  it("rejects an unknown provider", () => {
    expect(() => getAuthProvider({ AUTH_PROVIDER: "other" })).toThrow(
      "AUTH_PROVIDER must be nextauth or clerk"
    );
  });
});

describe("getClientAuthProvider", () => {
  it("uses the public provider setting", () => {
    expect(getClientAuthProvider({ NEXT_PUBLIC_AUTH_PROVIDER: "clerk" })).toBe("clerk");
  });

  it("does not expose or inherit the server-only provider setting", () => {
    expect(getClientAuthProvider({ AUTH_PROVIDER: "clerk" })).toBe("nextauth");
  });
});

describe("getClerkBackendClient", () => {
  it("requires the server-only secret key", () => {
    expect(() => getClerkBackendClient({})).toThrow("CLERK_SECRET_KEY is required when Clerk is enabled");
  });
});
