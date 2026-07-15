import process from "node:process";
import { pathToFileURL } from "node:url";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { getClerkBackendClient } from "../lib/clerkClient";
import {
  formatImportFailure,
  type ImportDependencies,
  type ImportMode,
  type ImportResult,
  type LocalUserForClerkImport,
  migrateUserToClerk,
  parseImportMode,
} from "./importUsersToClerk";

type ImportFailure = { code: string; userId: number };
type ImportSummary = Record<ImportResult["action"] | "failed", number>;
type MigrateUser = (
  user: LocalUserForClerkImport,
  mode: ImportMode,
  dependencies: ImportDependencies
) => Promise<ImportResult>;

const userSelect = {
  backupCodes: true,
  clerkUserId: true,
  createdDate: true,
  email: true,
  emailVerified: true,
  id: true,
  locked: true,
  name: true,
  password: { select: { hash: true } },
  twoFactorEnabled: true,
  twoFactorSecret: true,
  username: true,
} satisfies Prisma.UserSelect;

function createEmptySummary(): ImportSummary {
  return {
    "already-mapped": 0,
    created: 0,
    failed: 0,
    mapped: 0,
    "would-create": 0,
    "would-map": 0,
  };
}

function getFailureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code)) return code;
  }
  if (error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)) return error.message;
  return "CLERK_IMPORT_FAILED";
}

async function runClerkUserImport(
  mode: ImportMode,
  users: AsyncIterable<LocalUserForClerkImport>,
  migrate: MigrateUser,
  dependencies = {} as ImportDependencies
): Promise<{ failures: ImportFailure[]; summary: ImportSummary }> {
  const summary = createEmptySummary();
  const failures: ImportFailure[] = [];

  for await (const user of users) {
    try {
      const result = await migrate(user, mode, dependencies);
      summary[result.action] += 1;
    } catch (error) {
      summary.failed += 1;
      failures.push(formatImportFailure({ code: getFailureCode(error), userId: user.id }));
    }
  }

  return { failures, summary };
}

function parseFixtureUserId(args: string[], nodeEnv: string | undefined): number | null {
  const raw = args.find((arg) => arg.startsWith("--user-id="))?.split("=")[1];
  if (!raw) return null;
  if (nodeEnv === "production") throw new Error("--user-id is unavailable in production");

  const userId = Number(raw);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("--user-id must be a positive integer");
  return userId;
}

async function* getLocalUsers(fixtureUserId: number | null): AsyncGenerator<LocalUserForClerkImport> {
  let cursor = 0;
  while (true) {
    const users = await prisma.user.findMany({
      where: {
        id: fixtureUserId ?? { gt: cursor },
        locked: {},
      },
      orderBy: { id: "asc" },
      select: userSelect,
      take: 100,
    });
    if (users.length === 0) return;

    for (const user of users) yield user;
    if (fixtureUserId) return;
    cursor = users.at(-1)?.id ?? cursor;
  }
}

function createImportDependencies(): ImportDependencies {
  const clerk = getClerkBackendClient();
  return {
    createClerkUser: async (params) => clerk.users.createUser(params),
    decrypt: (value) => {
      const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
      if (!encryptionKey) throw new Error("MFA_DECRYPT_FAILED");
      return symmetricDecrypt(value, encryptionKey);
    },
    findByEmail: async (email) => {
      const response = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
      return response.data.map(({ id }) => ({ id }));
    },
    findByExternalId: async (externalId) => {
      const response = await clerk.users.getUserList({ externalId: [externalId], limit: 2 });
      return response.data.map(({ id }) => ({ id }));
    },
    mapLocalUser: async (userId, clerkUserId) => {
      await prisma.user.update({
        where: { id: userId },
        data: { clerkUserId },
        select: { id: true },
      });
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = parseImportMode(args);
  const fixtureUserId = parseFixtureUserId(args, process.env.NODE_ENV);
  const dependencies = createImportDependencies();
  const result = await runClerkUserImport(
    mode,
    getLocalUsers(fixtureUserId),
    migrateUserToClerk,
    dependencies
  );

  console.log(JSON.stringify({ mode, ...result }));
  if (result.summary.failed > 0) process.exitCode = 1;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({ code: getFailureCode(error), status: "failed" }));
    process.exitCode = 1;
  });
}

export { parseFixtureUserId, runClerkUserImport };
