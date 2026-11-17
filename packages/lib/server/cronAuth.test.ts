import { afterEach, describe, expect, it, vi } from "vitest";

import { isCronCredential, isCronSecretBearer } from "./cronAuth";

describe("cronAuth", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects the literal 'Bearer undefined' when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", undefined);
    vi.stubEnv("CRON_API_KEY", undefined);

    expect(isCronSecretBearer("Bearer undefined")).toBe(false);
    expect(isCronCredential("Bearer undefined")).toBe(false);
    expect(isCronCredential("undefined")).toBe(false);
    expect(isCronCredential(null)).toBe(false);
  });

  it("rejects empty secrets", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("CRON_API_KEY", "");

    expect(isCronSecretBearer("Bearer ")).toBe(false);
    expect(isCronCredential("")).toBe(false);
  });

  it("accepts the configured bearer secret or API key", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("CRON_API_KEY", "k3y");

    expect(isCronSecretBearer("Bearer s3cret")).toBe(true);
    expect(isCronSecretBearer("s3cret")).toBe(false);
    expect(isCronCredential("Bearer s3cret")).toBe(true);
    expect(isCronCredential("k3y")).toBe(true);
    expect(isCronCredential("Bearer k3y")).toBe(false);
  });
});
