import process from "node:process";
import { createClerkClient } from "@clerk/backend";
import { parsePublishableKey } from "@clerk/shared/keys";
import { Polar } from "@polar-sh/sdk";
import { Client as PostgresClient } from "pg";

type Environment = Record<string, string | undefined>;

const requiredConfiguration = [
  "AUTH_PROVIDER",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "DATABASE_URL",
  "NEXT_PUBLIC_AUTH_PROVIDER",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_WEBAPP_URL",
  "POLAR_ACCESS_TOKEN",
  "POLAR_PRO_ANNUAL_PRODUCT_ID",
  "POLAR_PRO_BENEFIT_ID",
  "POLAR_PRO_MONTHLY_PRODUCT_ID",
  "POLAR_SERVER",
  "POLAR_TEAM_ANNUAL_PRODUCT_ID",
  "POLAR_TEAM_BENEFIT_ID",
  "POLAR_TEAM_MONTHLY_PRODUCT_ID",
  "POLAR_WEBHOOK_SECRET",
] as const;

const configuredProducts = [
  { benefit: "POLAR_PRO_BENEFIT_ID", id: "POLAR_PRO_MONTHLY_PRODUCT_ID", interval: "MONTH", plan: "PRO" },
  { benefit: "POLAR_PRO_BENEFIT_ID", id: "POLAR_PRO_ANNUAL_PRODUCT_ID", interval: "YEAR", plan: "PRO" },
  {
    benefit: "POLAR_TEAM_BENEFIT_ID",
    id: "POLAR_TEAM_MONTHLY_PRODUCT_ID",
    interval: "MONTH",
    plan: "TEAM",
  },
  {
    benefit: "POLAR_TEAM_BENEFIT_ID",
    id: "POLAR_TEAM_ANNUAL_PRODUCT_ID",
    interval: "YEAR",
    plan: "TEAM",
  },
] as const;

function getMissingConfiguration(environment: Environment): string[] {
  return requiredConfiguration.filter((name) => !environment[name]?.trim());
}

function validateProviderConfiguration(environment: Environment): void {
  const missing = getMissingConfiguration(environment);
  if (missing.length > 0) throw new Error(`Missing Clerk/Polar E2E configuration: ${missing.join(", ")}`);
  if (environment.AUTH_PROVIDER !== "clerk") throw new Error("AUTH_PROVIDER must be clerk");
  if (environment.NEXT_PUBLIC_AUTH_PROVIDER !== "clerk") {
    throw new Error("NEXT_PUBLIC_AUTH_PROVIDER must be clerk");
  }
  if (environment.POLAR_SERVER !== "sandbox") throw new Error("POLAR_SERVER must be sandbox");
}

function requireValue(environment: Environment, name: (typeof requiredConfiguration)[number]): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function verifyDatabase(environment: Environment): Promise<void> {
  const database = new PostgresClient({ connectionString: requireValue(environment, "DATABASE_URL") });
  try {
    await database.connect();
    await database.query("SELECT 1");
  } finally {
    await database.end();
  }
}

async function verifyPolarCatalog(environment: Environment): Promise<void> {
  const polar = new Polar({
    accessToken: requireValue(environment, "POLAR_ACCESS_TOKEN"),
    server: "sandbox",
  });
  for (const expected of configuredProducts) {
    const product = await polar.products.get({ id: requireValue(environment, expected.id) });
    if (
      product.metadata.plan_key !== expected.plan ||
      product.metadata.billing_interval !== expected.interval ||
      !product.benefits.some(({ id }) => id === requireValue(environment, expected.benefit))
    ) {
      throw new Error(`${expected.id} does not match the required Polar catalog mapping`);
    }
  }
}

async function configureClerkTestingToken(environment: Environment): Promise<void> {
  const publishableKey = requireValue(environment, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const frontendApi = parsePublishableKey(publishableKey)?.frontendApi;
  if (!frontendApi) throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is invalid");
  const clerk = createClerkClient({ secretKey: requireValue(environment, "CLERK_SECRET_KEY") });
  const testingToken = await clerk.testingTokens.createTestingToken();
  process.env.CLERK_FAPI = frontendApi;
  process.env.CLERK_TESTING_TOKEN = testingToken.token;
}

async function globalSetup(): Promise<void> {
  validateProviderConfiguration(process.env);
  await Promise.all([verifyDatabase(process.env), verifyPolarCatalog(process.env)]);
  await configureClerkTestingToken(process.env);
}

export default globalSetup;
export { getMissingConfiguration, validateProviderConfiguration };
