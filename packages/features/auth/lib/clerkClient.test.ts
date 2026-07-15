import { describe, expect, it } from "vitest";
import { getAuthProvider, getClerkBackendClient } from "./clerkClient";
import { getClientAuthProvider } from "./clientAuthProvider";

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
    expect(getClientAuthProvider("clerk")).toBe("clerk");
  });

  it("defaults to the legacy provider", () => {
    expect(getClientAuthProvider(undefined)).toBe("nextauth");
  });
});

describe("getClerkBackendClient", () => {
  it("requires the server-only secret key", () => {
    expect(() => getClerkBackendClient({})).toThrow("CLERK_SECRET_KEY is required when Clerk is enabled");
  });

  it("requires a publishable key for request verification", () => {
    expect(() => getClerkBackendClient({ CLERK_SECRET_KEY: "secret" })).toThrow(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required when Clerk is enabled"
    );
  });
});
