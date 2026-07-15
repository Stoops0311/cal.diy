import { beforeEach, describe, expect, it, vi } from "vitest";

const { polarConstructor } = vi.hoisted(() => ({ polarConstructor: vi.fn() }));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    constructor(options: unknown) {
      polarConstructor(options);
    }
  },
}));

import {
  getPolarClient,
  getPolarConfiguration,
  getPolarProduct,
  resolveConfiguredPolarProduct,
} from "./PolarClient";

const completeEnvironment = {
  POLAR_ACCESS_TOKEN: "polar_test_token",
  POLAR_PRO_ANNUAL_PRODUCT_ID: "product_pro_year",
  POLAR_PRO_MONTHLY_PRODUCT_ID: "product_pro_month",
  POLAR_SERVER: "sandbox",
  POLAR_TEAM_ANNUAL_PRODUCT_ID: "product_team_year",
  POLAR_TEAM_MONTHLY_PRODUCT_ID: "product_team_month",
  POLAR_WEBHOOK_SECRET: "polar_test_webhook_secret",
} as const;

describe("Polar configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires every server-only setting", () => {
    expect(() => getPolarConfiguration({})).toThrow("POLAR_ACCESS_TOKEN is required");
    expect(() =>
      getPolarConfiguration({
        ...completeEnvironment,
        POLAR_TEAM_ANNUAL_PRODUCT_ID: undefined,
      })
    ).toThrow("POLAR_TEAM_ANNUAL_PRODUCT_ID is required");
  });

  it("does not accept public environment aliases for secrets", () => {
    expect(() =>
      getPolarConfiguration({
        NEXT_PUBLIC_POLAR_ACCESS_TOKEN: completeEnvironment.POLAR_ACCESS_TOKEN,
        NEXT_PUBLIC_POLAR_WEBHOOK_SECRET: completeEnvironment.POLAR_WEBHOOK_SECRET,
      })
    ).toThrow("POLAR_ACCESS_TOKEN is required");
  });

  it.each([
    ["PRO", "MONTH", "product_pro_month"],
    ["PRO", "YEAR", "product_pro_year"],
    ["TEAM", "MONTH", "product_team_month"],
    ["TEAM", "YEAR", "product_team_year"],
  ] as const)("resolves %s:%s", (plan, interval, id) => {
    expect(getPolarProduct(plan, interval, completeEnvironment)).toEqual({ id, interval, plan });
  });

  it("rejects duplicate product IDs", () => {
    expect(() =>
      getPolarConfiguration({
        ...completeEnvironment,
        POLAR_TEAM_ANNUAL_PRODUCT_ID: completeEnvironment.POLAR_PRO_ANNUAL_PRODUCT_ID,
      })
    ).toThrow("Polar product IDs must be unique");
  });

  it("rejects an unknown server", () => {
    expect(() => getPolarConfiguration({ ...completeEnvironment, POLAR_SERVER: "preview" })).toThrow(
      "POLAR_SERVER must be sandbox or production"
    );
  });

  it("constructs the SDK for the configured sandbox server", () => {
    getPolarClient(completeEnvironment);

    expect(polarConstructor).toHaveBeenCalledWith({
      accessToken: completeEnvironment.POLAR_ACCESS_TOKEN,
      server: "sandbox",
    });
  });

  it("verifies webhook product metadata against the configured mapping", () => {
    expect(
      resolveConfiguredPolarProduct(
        "product_team_month",
        { billing_interval: "MONTH", plan_key: "TEAM" },
        completeEnvironment
      )
    ).toEqual({ id: "product_team_month", interval: "MONTH", plan: "TEAM" });

    expect(() =>
      resolveConfiguredPolarProduct(
        "product_team_month",
        { billing_interval: "MONTH", plan_key: "PRO" },
        completeEnvironment
      )
    ).toThrow("Polar product metadata does not match configured product");
  });

  it("rejects unconfigured webhook products", () => {
    expect(() =>
      resolveConfiguredPolarProduct(
        "product_unknown",
        { billing_interval: "MONTH", plan_key: "PRO" },
        completeEnvironment
      )
    ).toThrow("Polar product is not configured");
  });
});
