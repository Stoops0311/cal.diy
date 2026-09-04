import { afterEach, describe, expect, test, vi } from "vitest";
import { getClientAuthProvider } from "./clientAuthProvider";

describe("getClientAuthProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("uses the public auth provider when the caller has no runtime value", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "clerk");

    expect(getClientAuthProvider()).toBe("clerk");
  });
});
