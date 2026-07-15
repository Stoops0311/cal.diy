import process from "node:process";
import { Polar } from "@polar-sh/sdk";
import type { BillingIntervalType, PaidPlanKey } from "../lib/plans";

type PolarEnvironment = Record<string, string | undefined>;
type PolarServer = "production" | "sandbox";
type PolarProductKey = `${PaidPlanKey}:${BillingIntervalType}`;

type ConfiguredPolarProduct = {
  id: string;
  interval: BillingIntervalType;
  plan: PaidPlanKey;
};

type ConfiguredPolarBenefit = {
  id: string;
  marker: "convenio-pro" | "convenio-team";
};

type PolarConfiguration = {
  accessToken: string;
  benefits: Record<PaidPlanKey, ConfiguredPolarBenefit>;
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
  const benefits = {
    PRO: { id: requireEnvironmentValue(env, "POLAR_PRO_BENEFIT_ID"), marker: "convenio-pro" },
    TEAM: { id: requireEnvironmentValue(env, "POLAR_TEAM_BENEFIT_ID"), marker: "convenio-team" },
  } as const satisfies Record<PaidPlanKey, ConfiguredPolarBenefit>;
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

  const benefitIds = Object.values(benefits).map(({ id }) => id);
  if (new Set(benefitIds).size !== benefitIds.length) {
    throw new Error("Polar benefit IDs must be unique");
  }

  return { accessToken, benefits, products, server: getPolarServer(env), webhookSecret };
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

function resolveConfiguredPolarBenefits(
  benefitIds: string[],
  env: PolarEnvironment = process.env
): ConfiguredPolarBenefit["marker"][] {
  const configuredBenefits = Object.values(getPolarConfiguration(env).benefits);
  return configuredBenefits.filter(({ id }) => benefitIds.includes(id)).map(({ marker }) => marker);
}

export {
  getPolarClient,
  getPolarConfiguration,
  getPolarProduct,
  resolveConfiguredPolarBenefits,
  resolveConfiguredPolarProduct,
};
export type {
  ConfiguredPolarBenefit,
  ConfiguredPolarProduct,
  PolarConfiguration,
  PolarEnvironment,
  PolarProductMetadata,
  PolarServer,
};
