import type { ConfigService } from "@nestjs/config";
import { getApiBrowserAuthProvider } from "./api-auth.strategy";

function configWith(provider: unknown): ConfigService {
  return { get: jest.fn().mockReturnValue(provider) } as unknown as ConfigService;
}

describe("getApiBrowserAuthProvider", () => {
  it.each(["nextauth", "clerk"] as const)("accepts %s", (provider) => {
    expect(getApiBrowserAuthProvider(configWith(provider))).toBe(provider);
  });

  it("defaults to NextAuth during rollback", () => {
    expect(getApiBrowserAuthProvider(configWith(undefined))).toBe("nextauth");
  });

  it("rejects unsupported providers", () => {
    expect(() => getApiBrowserAuthProvider(configWith("unsupported"))).toThrow("AUTH_PROVIDER");
  });
});
