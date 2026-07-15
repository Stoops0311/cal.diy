import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { prisma } from "@calcom/prisma";
import { createClerkClient } from "@clerk/backend";
import { parsePublishableKey } from "@clerk/shared/keys";
import { expect, type Page, test } from "@playwright/test";
import { hash } from "bcryptjs";
import { migrateUserToClerk } from "../../../../packages/features/auth/scripts/importUsersToClerk";
import {
  createE2ERunTag,
  createFixtureManifest,
  type FixtureManifest,
  registerFixture,
  taggedMetadata,
  writeFixtureManifest,
} from "./fixtures";

type RollbackPhase = "prepare" | "verify";
type RollbackState = {
  activeClerkUserId: string;
  activeLocalUserId: number;
  eventTypeId: number;
  lockedClerkUserId: string;
  lockedLocalUserId: number;
  runTag: string;
};
type BrowserClerk = {
  signOut(): Promise<void>;
};

const statePath = path.join(process.cwd(), "test-results", "clerk-polar", "rollback-state.json");
const execFileAsync = promisify(execFile);
const clerk = createClerkClient({ secretKey: requireEnvironment("CLERK_SECRET_KEY") });

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function rollbackPhase(): RollbackPhase {
  const phase = process.env.ROLLBACK_PHASE;
  if (phase !== "prepare" && phase !== "verify") {
    throw new Error("ROLLBACK_PHASE must be prepare or verify");
  }
  return phase;
}

function fixtureValues(runTag: string): {
  activeEmail: string;
  activePassword: string;
  activeUsername: string;
  lockedEmail: string;
  lockedPassword: string;
  lockedUsername: string;
} {
  const suffix = runTag.split("-").at(-1);
  if (!suffix) throw new Error("rollback fixture suffix is missing");
  return {
    activeEmail: `convenio+clerk_test_rollback_${suffix}@gmail.com`,
    activePassword: `Rollback!${suffix}Pass2026`,
    activeUsername: `rb_${suffix}_active`,
    lockedEmail: `convenio+clerk_test_rollback_locked_${suffix}@gmail.com`,
    lockedPassword: `Locked!${suffix}Pass2026`,
    lockedUsername: `rb_${suffix}_locked`,
  };
}

async function setupClerkTestingToken(page: Page): Promise<void> {
  const parsed = parsePublishableKey(requireEnvironment("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"));
  if (!parsed?.frontendApi) throw new Error("Clerk publishable key is invalid");
  const frontendApi = parsed.frontendApi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = (await clerk.testingTokens.createTestingToken()).token;
  await page.context().route(new RegExp(`^https://${frontendApi}/v1/`), async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("__clerk_testing_token", token);
    await route.continue({ url: url.toString() });
  });
}

async function createMigratedFixture(input: {
  email: string;
  locked: boolean;
  manifest: FixtureManifest;
  name: string;
  password: string;
  runTag: string;
  username: string;
}): Promise<{ clerkUserId: string; localUserId: number }> {
  const local = await prisma.user.create({
    data: {
      completedOnboarding: true,
      email: input.email,
      emailVerified: new Date(),
      locked: input.locked,
      metadata: taggedMetadata(input.runTag),
      name: input.name,
      password: { create: { hash: await hash(input.password, 12) } },
      username: input.username,
    },
    select: {
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
    },
  });
  await registerFixture(input.manifest, { id: String(local.id), kind: "local_user" });
  await migrateUserToClerk(local, "apply", {
    createClerkUser: (params) => clerk.users.createUser(params),
    decrypt: (value) => value,
    findByEmail: async (email) =>
      (await clerk.users.getUserList({ emailAddress: [email], limit: 2 })).data.map(({ id }) => ({ id })),
    findByExternalId: async (externalId) =>
      (await clerk.users.getUserList({ externalId: [externalId], limit: 2 })).data.map(({ id }) => ({ id })),
    mapLocalUser: async (userId, clerkUserId) => {
      await prisma.user.update({ where: { id: userId }, data: { clerkUserId }, select: { id: true } });
    },
  });
  const users = await clerk.users.getUserList({ emailAddress: [input.email], limit: 2 });
  if (users.data.length !== 1 || !users.data[0]) throw new Error("rollback Clerk user is ambiguous");
  await clerk.users.updateUserMetadata(users.data[0].id, { publicMetadata: taggedMetadata(input.runTag) });
  await registerFixture(input.manifest, { id: users.data[0].id, kind: "clerk_user" });
  return { clerkUserId: users.data[0].id, localUserId: local.id };
}

async function signInWithClerk(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const verificationCode = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await expect
    .poll(async () => /\/event-types/.test(page.url()) || verificationCode.isVisible().catch(() => false))
    .toBe(true);
  if (await verificationCode.isVisible().catch(() => false)) {
    await verificationCode.fill("424242");
    await verificationCode.press("Enter");
  }
  await expect(page).toHaveURL(/\/event-types/, { timeout: 45_000 });
}

async function signOutOfClerk(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const browserClerk = (window as Window & { Clerk?: BrowserClerk }).Clerk;
    if (!browserClerk) throw new Error("Clerk browser client is unavailable");
    await browserClerk.signOut();
  });
  await page.goto("/auth/login");
}

async function signInWithNextAuth(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/event-types/);
}

async function writeState(state: RollbackState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function readState(): Promise<RollbackState> {
  return JSON.parse(await readFile(statePath, "utf8")) as RollbackState;
}

test("Clerk enablement rolls back to NextAuth without changing local identity ownership", async ({
  page,
}) => {
  if (rollbackPhase() === "prepare") {
    if (process.env.AUTH_PROVIDER !== "clerk") throw new Error("prepare requires AUTH_PROVIDER=clerk");
    await setupClerkTestingToken(page);
    const runTag = createE2ERunTag();
    const values = fixtureValues(runTag);
    const manifest = createFixtureManifest(runTag);
    await writeFixtureManifest(manifest);
    const active = await createMigratedFixture({
      email: values.activeEmail,
      locked: false,
      manifest,
      name: "Rollback Active User",
      password: values.activePassword,
      runTag,
      username: values.activeUsername,
    });
    const locked = await createMigratedFixture({
      email: values.lockedEmail,
      locked: true,
      manifest,
      name: "Rollback Locked User",
      password: values.lockedPassword,
      runTag,
      username: values.lockedUsername,
    });
    await signInWithClerk(page, values.activeEmail, values.activePassword);
    const eventType = await prisma.eventType.create({
      data: {
        length: 30,
        owner: { connect: { id: active.localUserId } },
        slug: `rollback-${runTag.split("-").at(-1)}`,
        title: "Rollback scheduling continuity",
        users: { connect: { id: active.localUserId } },
      },
      select: { id: true },
    });
    await writeState({
      activeClerkUserId: active.clerkUserId,
      activeLocalUserId: active.localUserId,
      eventTypeId: eventType.id,
      lockedClerkUserId: locked.clerkUserId,
      lockedLocalUserId: locked.localUserId,
      runTag,
    });
    await signOutOfClerk(page);
    await page.getByRole("textbox", { name: "Email address" }).fill(values.lockedEmail);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const lockedPassword = page.locator('input[name="password"]');
    if (await lockedPassword.isVisible().catch(() => false)) {
      await lockedPassword.fill(values.lockedPassword);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
    await expect(page).not.toHaveURL(/\/event-types/);
    return;
  }

  if (process.env.AUTH_PROVIDER !== "nextauth") throw new Error("verify requires AUTH_PROVIDER=nextauth");
  const state = await readState();
  const values = fixtureValues(state.runTag);
  try {
    await signInWithNextAuth(page, values.activeEmail, values.activePassword);
    const session = await page.evaluate(async () => {
      const response = await fetch("/api/auth/current-session");
      return { body: (await response.json()) as { user?: { id?: number } }, status: response.status };
    });
    expect(session.status).toBe(200);
    expect(session.body.user?.id).toBe(state.activeLocalUserId);
    await expect(
      prisma.eventType.findUnique({
        where: { id: state.eventTypeId },
        select: { id: true, userId: true },
      })
    ).resolves.toEqual({ id: state.eventTypeId, userId: state.activeLocalUserId });

    await page.context().clearCookies();
    await page.goto("/auth/login");
    await page.locator("#email").fill(values.lockedEmail);
    await page.locator("#password").fill(values.lockedPassword);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.locator("body")).toContainText(/locked|unable to sign in|account/i);
  } finally {
    await execFileAsync("yarn", ["clerk-polar:e2e-cleanup", `--run-tag=${state.runTag}`], {
      cwd: process.cwd(),
      env: process.env,
    });
  }
});
