import process from "node:process";
import { pathToFileURL } from "node:url";
import { createClerkClient } from "@clerk/backend";
import { Polar } from "@polar-sh/sdk";
import { Client as PostgresClient } from "pg";
import {
  cleanupTaggedFixtures,
  E2E_METADATA_KEY,
  E2E_RUN_TAG_PATTERN,
  type FixtureCleanupAdapter,
  type FixtureReference,
  readFixtureManifest,
} from "../apps/web/playwright/clerk-polar/fixtures.ts";

type CleanupArguments = { runTag: string };
type MetadataRow = { metadata: unknown };

function parseCleanupArguments(args: string[]): CleanupArguments {
  const values = args
    .filter((argument) => argument.startsWith("--run-tag="))
    .map((argument) => argument.slice(10));
  if (values.length === 0) throw new Error("--run-tag is required");
  if (values.length !== 1) throw new Error("exactly one --run-tag is required");
  const runTag = values[0];
  if (!runTag || !E2E_RUN_TAG_PATTERN.test(runTag)) throw new Error("invalid E2E run tag");
  return { runTag };
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isMissingProviderObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; statusCode?: number };
  return candidate.status === 404 || candidate.statusCode === 404;
}

function splitMembership(reference: FixtureReference): { organizationId: string; userId: string } {
  const [organizationId, userId] = reference.id.split(":");
  if (!organizationId || !userId) throw new Error("invalid Clerk membership fixture ID");
  return { organizationId, userId };
}

async function createRuntimeCleanupAdapter(): Promise<FixtureCleanupAdapter> {
  const clerk = createClerkClient({
    publishableKey: requireEnvironment("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    secretKey: requireEnvironment("CLERK_SECRET_KEY"),
  });
  const polar = new Polar({
    accessToken: requireEnvironment("POLAR_ACCESS_TOKEN"),
    server: process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
  });
  const database = new PostgresClient({ connectionString: requireEnvironment("DATABASE_URL") });
  await database.connect();

  return {
    close: async () => database.end(),
    load: async (reference) => {
      try {
        if (reference.kind === "clerk_user") {
          return { metadata: (await clerk.users.getUser(reference.id)).publicMetadata };
        }
        if (reference.kind === "clerk_organization") {
          return {
            metadata: (await clerk.organizations.getOrganization({ organizationId: reference.id }))
              .publicMetadata,
          };
        }
        if (reference.kind === "clerk_membership") {
          const membership = splitMembership(reference);
          const result = await clerk.organizations.getOrganizationMembershipList({
            limit: 2,
            organizationId: membership.organizationId,
            userId: [membership.userId],
          });
          return result.data[0] ? { metadata: result.data[0].publicMetadata } : null;
        }
        if (reference.kind === "polar_customer") {
          return { metadata: (await polar.customers.get({ id: reference.id })).metadata };
        }
        if (reference.kind === "polar_subscription") {
          return { metadata: (await polar.subscriptions.get({ id: reference.id })).metadata };
        }
        if (reference.kind === "local_user") {
          const result = await database.query<MetadataRow>("SELECT metadata FROM users WHERE id = $1", [
            reference.id,
          ]);
          return result.rows[0] ?? null;
        }
        if (reference.kind === "local_organization") {
          const result = await database.query<MetadataRow>('SELECT metadata FROM "Team" WHERE id = $1', [
            reference.id,
          ]);
          return result.rows[0] ?? null;
        }
        const result = await database.query<MetadataRow>(
          `SELECT COALESCE(u.metadata, t.metadata) AS metadata
             FROM "BillingSubscription" b
             LEFT JOIN users u ON u.id = b."userId"
             LEFT JOIN "Team" t ON t.id = b."organizationId"
            WHERE b.id = $1`,
          [reference.id]
        );
        return result.rows[0] ?? null;
      } catch (error) {
        if (isMissingProviderObject(error)) return null;
        throw error;
      }
    },
    remove: async (reference) => {
      if (reference.kind === "clerk_user") return void (await clerk.users.deleteUser(reference.id));
      if (reference.kind === "clerk_organization") {
        return void (await clerk.organizations.deleteOrganization(reference.id));
      }
      if (reference.kind === "clerk_membership") {
        return void (await clerk.organizations.deleteOrganizationMembership(splitMembership(reference)));
      }
      if (reference.kind === "polar_subscription") {
        return void (await polar.subscriptions.revoke({ id: reference.id }));
      }
      if (reference.kind === "polar_customer") {
        return void (await polar.customers.delete({ id: reference.id }));
      }
      const table =
        reference.kind === "local_user"
          ? "users"
          : reference.kind === "local_organization"
            ? '"Team"'
            : '"BillingSubscription"';
      await database.query(`DELETE FROM ${table} WHERE id = $1`, [reference.id]);
    },
  };
}

async function main(): Promise<void> {
  const { runTag } = parseCleanupArguments(process.argv.slice(2));
  const manifest = await readFixtureManifest(runTag);
  if (!manifest) {
    console.log(JSON.stringify({ removed: 0, runTag, skipped: 0, status: "no-manifest" }));
    return;
  }
  const result = await cleanupTaggedFixtures(manifest, await createRuntimeCleanupAdapter());
  console.log(JSON.stringify({ ...result, runTag, status: "clean" }));
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? error.code : "E2E_CLEANUP_FAILED";
    console.error(JSON.stringify({ code, status: "failed" }));
    process.exitCode = 1;
  });
}

export { createRuntimeCleanupAdapter, parseCleanupArguments };
export { E2E_METADATA_KEY };
