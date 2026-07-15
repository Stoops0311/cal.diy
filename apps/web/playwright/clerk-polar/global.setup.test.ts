import { describe, expect, it } from "vitest";
import { getMissingConfiguration, validateProviderConfiguration } from "./global.setup";

const requiredEnvironment = {
  AUTH_PROVIDER: "clerk",
  CLERK_SECRET_KEY: "secret",
  CLERK_WEBHOOK_SIGNING_SECRET: "secret",
  DATABASE_URL: "postgresql://localhost/test",
  NEXT_PUBLIC_AUTH_PROVIDER: "clerk",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_value",
  NEXT_PUBLIC_WEBAPP_URL: "http://localhost:3000",
  POLAR_ACCESS_TOKEN: "token",
  POLAR_PRO_ANNUAL_PRODUCT_ID: "product-2",
  POLAR_PRO_BENEFIT_ID: "benefit-1",
  POLAR_PRO_MONTHLY_PRODUCT_ID: "product-1",
  POLAR_SERVER: "sandbox",
  POLAR_TEAM_ANNUAL_PRODUCT_ID: "product-4",
  POLAR_TEAM_BENEFIT_ID: "benefit-2",
  POLAR_TEAM_MONTHLY_PRODUCT_ID: "product-3",
  POLAR_WEBHOOK_SECRET: "secret",
};

describe("Clerk and Polar E2E global setup", () => {
  it("reports missing variable names without values", () => {
    expect(getMissingConfiguration({ AUTH_PROVIDER: "clerk" })).toEqual(
      expect.arrayContaining(["CLERK_SECRET_KEY", "POLAR_ACCESS_TOKEN", "DATABASE_URL"])
    );
  });

  it("requires Clerk mode and Polar sandbox", () => {
    expect(() =>
      validateProviderConfiguration({ ...requiredEnvironment, AUTH_PROVIDER: "nextauth" })
    ).toThrow("AUTH_PROVIDER must be clerk");
    expect(() =>
      validateProviderConfiguration({ ...requiredEnvironment, POLAR_SERVER: "production" })
    ).toThrow("POLAR_SERVER must be sandbox");
  });

  it("accepts a complete sandbox configuration", () => {
    expect(getMissingConfiguration(requiredEnvironment)).toEqual([]);
    expect(() => validateProviderConfiguration(requiredEnvironment)).not.toThrow();
  });
});
