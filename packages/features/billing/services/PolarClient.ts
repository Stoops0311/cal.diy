import process from "node:process";
import { Polar } from "@polar-sh/sdk";
import type { BillingInterval as BillingIntervalType, PaidPlanKey } from "../lib/plans";

type PolarEnvironment = Record<string, string | undefined>;
type PolarServer = "production" | "sandbox";
type PolarProductKey = `${PaidPlanKey}:${BillingIntervalType}`;

type ConfiguredPolarProduct = {
  id: string;
  interval: BillingIntervalType;
  plan: PaidPlanKey;
};

type PolarConfiguration = {
  accessToken: string;
  products: Record<PolarProductKey, ConfiguredPolarProduct>;
  server: PolarServer;
  webhookSecret: string;
};

type PolarProductMetadata = Record<string, unknown>;

const productEnvironmentKeys = {
  "PRO:MONTH": "POLAR_PRO_MONTHLY_PRODUCT_ID",
  "PRO:YEAR": "POLAR_PRO_ANNUAL_PRODUCT_ID",
  "TEAM:MONTH": "POLAR_TEAM_MONTHLY_PRODUCT_ID",
  "TEAM:YEAR": "POLAR_TEAM_ANNUAL_PRODUCT_ID",
} as const satisfies Record<PolarProductKey, string>;

function requireEnvironmentValue(env: PolarEnvironment, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function getPolarServer(env: PolarEnvironment): PolarServer {
  const server = env.POLAR_SERVER ?? "sandbox";
  if (server !== "sandbox" && server !== "production") {
    throw new Error("POLAR_SERVER must be sandbox or production");
  }
  return server;
}

function getPolarConfiguration(env: PolarEnvironment = process.env): PolarConfiguration {
  const accessToken = requireEnvironmentValue(env, "POLAR_ACCESS_TOKEN");
  const webhookSecret = requireEnvironmentValue(env, "POLAR_WEBHOOK_SECRET");
  const products = Object.fromEntries(
    Object.entries(productEnvironmentKeys).map(([key, environmentKey]) => {
      const [plan, interval] = key.split(":") as [PaidPlanKey, BillingIntervalType];
      return [key, { id: requireEnvironmentValue(env, environmentKey), interval, plan }];
    })
  ) as Record<PolarProductKey, ConfiguredPolarProduct>;

  const productIds = Object.values(products).map(({ id }) => id);
  if (new Set(productIds).size !== productIds.length) {
    throw new Error("Polar product IDs must be unique");
  }

  return { accessToken, products, server: getPolarServer(env), webhookSecret };
}

function getPolarClient(env: PolarEnvironment = process.env): Polar {
  const configuration = getPolarConfiguration(env);
  return new Polar({ accessToken: configuration.accessToken, server: configuration.server });
}

function getPolarProduct(
  plan: PaidPlanKey,
  interval: BillingIntervalType,
  env: PolarEnvironment = process.env
): ConfiguredPolarProduct {
  return getPolarConfiguration(env).products[`${plan}:${interval}`];
}

function resolveConfiguredPolarProduct(
  productId: string,
  metadata: PolarProductMetadata,
  env: PolarEnvironment = process.env
): ConfiguredPolarProduct {
  const product = Object.values(getPolarConfiguration(env).products).find(({ id }) => id === productId);
  if (!product) throw new Error("Polar product is not configured");

  if (metadata.plan_key !== product.plan || metadata.billing_interval !== product.interval) {
    throw new Error("Polar product metadata does not match configured product");
  }

  return product;
}

export { getPolarClient, getPolarConfiguration, getPolarProduct, resolveConfiguredPolarProduct };
export type {
  ConfiguredPolarProduct,
  PolarConfiguration,
  PolarEnvironment,
  PolarProductMetadata,
  PolarServer,
};
