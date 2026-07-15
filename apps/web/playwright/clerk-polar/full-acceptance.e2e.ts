import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";
import { prisma } from "@calcom/prisma";
import { createClerkClient } from "@clerk/backend";
import { expect, type Page, test } from "@playwright/test";
import { hash } from "bcryptjs";
import { migrateUserToClerk } from "../../../../packages/features/auth/scripts/importUsersToClerk";
import { assertOneLocalUser, waitForOneLocalUser } from "./databaseAssertions";
import {
  createE2ERunTag,
  createFixtureManifest,
  type FixtureManifest,
  registerFixture,
  taggedMetadata,
  writeFixtureManifest,
} from "./fixtures";

test.describe.configure({ mode: "serial" });

const clerk = createClerkClient({ secretKey: requireEnvironment("CLERK_SECRET_KEY") });
const runTag = createE2ERunTag();
const suffix = runTag.split("-").at(-1) ?? "fixture";
const primaryEmail = `convenio+clerk_test_${suffix}@example.com`;
const primaryPassword = `Conv!${suffix}Pass2026`;
const migratedEmail = `convenio+clerk_test_migrated_${suffix}@example.com`;
const migratedPassword = `Migrated!${suffix}Pass2026`;
const primaryUsername = `conv_${suffix}_primary`;
const migratedUsername = `conv_${suffix}_migrated`;
const manifest: FixtureManifest = createFixtureManifest(runTag);
const execFileAsync = promisify(execFile);

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function setupClerkTestingToken(page: Page): Promise<void> {
  const frontendApi = requireEnvironment("CLERK_FAPI").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = requireEnvironment("CLERK_TESTING_TOKEN");
  const matcher = new RegExp(`^https://${frontendApi}/v1/`);
  await page.context().route(matcher, async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("__clerk_testing_token", token);
    const response = await route.fetch({ url: url.toString() });
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
      await route.fulfill({ response });
      return;
    }
    const body = (await response.json()) as {
      client?: { captcha_bypass?: boolean };
      response?: { captcha_bypass?: boolean };
    };
    if (body.client?.captcha_bypass === false) body.client.captcha_bypass = true;
    if (body.response?.captcha_bypass === false) body.response.captcha_bypass = true;
    await route.fulfill({ response, json: body });
  });
}

async function completeSignUp(page: Page): Promise<void> {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email address" }).fill(primaryEmail);
  await page.locator('input[name="password"]').fill(primaryPassword);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (/\/(getting-started|event-types)/.test(new URL(page.url()).pathname)) return;
    const username = page.locator('input[name="username"]');
    if (await username.isVisible().catch(() => false)) {
      await username.fill(primaryUsername);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      continue;
    }
    const code = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
    if (await code.isVisible().catch(() => false)) {
      await code.fill("424242");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      continue;
    }
    await page.waitForTimeout(500);
  }
  await expect(page).toHaveURL(/\/(getting-started|event-types)/);
}

async function completePersonalOnboarding(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding\/getting-started/);
  await page.getByText("For personal use", { exact: true }).click();
  await page.getByTestId("onboarding-continue-btn").click();
  await expect(page).toHaveURL(/\/onboarding\/personal\/settings/);

  await page.getByRole("textbox", { name: "Your name" }).fill("Convenio E2E User");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/personal\/calendar/);

  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page).toHaveURL(/\/event-types/);
}

async function signInWithPassword(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const verificationCode = page.getByRole("textbox", { name: "Enter verification code" });
  await expect
    .poll(async () => /\/event-types/.test(page.url()) || verificationCode.isVisible().catch(() => false))
    .toBe(true);
  if (await verificationCode.isVisible().catch(() => false)) {
    await verificationCode.fill("424242");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/event-types/);
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/auth/logout");
  await expect(page).toHaveURL(/\/auth\/login/);
}

async function getSingleClerkUser(email: string): Promise<{ id: string }> {
  const users = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
  if (users.data.length !== 1 || !users.data[0])
    throw new Error(`Expected exactly one Clerk user for ${email}`);
  return users.data[0];
}

async function tagAndRegisterMappedUser(
  email: string
): Promise<{ clerkUserId: string; localUserId: number }> {
  const clerkUser = await getSingleClerkUser(email);
  await clerk.users.updateUserMetadata(clerkUser.id, { publicMetadata: taggedMetadata(runTag) });
  await registerFixture(manifest, { id: clerkUser.id, kind: "clerk_user" });
  const localUser = await waitForOneLocalUser(email, clerkUser.id);
  await prisma.user.update({
    where: { id: localUser.id },
    data: { metadata: taggedMetadata(runTag) },
    select: { id: true },
  });
  await registerFixture(manifest, { id: String(localUser.id), kind: "local_user" });
  return { clerkUserId: clerkUser.id, localUserId: localUser.id };
}

async function createMigratedBcryptFixture(): Promise<{ clerkUserId: string; localUserId: number }> {
  const passwordHash = await hash(migratedPassword, 12);
  const local = await prisma.user.create({
    data: {
      completedOnboarding: true,
      email: migratedEmail,
      emailVerified: new Date(),
      metadata: taggedMetadata(runTag),
      name: "Migrated E2E User",
      password: { create: { hash: passwordHash } },
      username: migratedUsername,
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
  await registerFixture(manifest, { id: String(local.id), kind: "local_user" });
  await migrateUserToClerk(local, "apply", {
    createClerkUser: (input) => clerk.users.createUser(input),
    decrypt: (value) => value,
    findByEmail: async (email) =>
      (await clerk.users.getUserList({ emailAddress: [email], limit: 2 })).data.map(({ id }) => ({ id })),
    findByExternalId: async (externalId) =>
      (await clerk.users.getUserList({ externalId: [externalId], limit: 2 })).data.map(({ id }) => ({ id })),
    mapLocalUser: async (userId, clerkUserId) => {
      await prisma.user.update({ where: { id: userId }, data: { clerkUserId }, select: { id: true } });
    },
  });
  const migrated = await getSingleClerkUser(migratedEmail);
  await clerk.users.updateUserMetadata(migrated.id, { publicMetadata: taggedMetadata(runTag) });
  await registerFixture(manifest, { id: migrated.id, kind: "clerk_user" });
  return { clerkUserId: migrated.id, localUserId: local.id };
}

test.beforeAll(async () => {
  await writeFixtureManifest(manifest);
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.afterAll(async () => {
  await execFileAsync("yarn", ["clerk-polar:e2e-cleanup", `--run-tag=${runTag}`], {
    cwd: process.cwd(),
    env: process.env,
  });
});

test("Clerk and Polar full acceptance story", async ({ page, request }) => {
  await setupClerkTestingToken(page);

  await test.step("new email/password signup, verification, provisioning, and personal onboarding", async () => {
    await completeSignUp(page);
    await page.goto("/event-types");
    const mapped = await tagAndRegisterMappedUser(primaryEmail);
    await assertOneLocalUser(primaryEmail, mapped.clerkUserId);
    await completePersonalOnboarding(page);
    await page.screenshot({
      path: `test-results/clerk-polar/screenshots/${runTag}-authenticated.png`,
      fullPage: true,
    });
  });

  await test.step("sign-out, protected redirect, password login, and session persistence", async () => {
    await signOut(page);
    await page.goto("/event-types");
    await expect(page).toHaveURL(/\/auth\/login/);
    await signInWithPassword(page, primaryEmail, primaryPassword);
    await page.reload();
    await expect(page).toHaveURL(/\/event-types/);
  });

  await test.step("migrated bcrypt user signs in with the unchanged password", async () => {
    const migrated = await createMigratedBcryptFixture();
    await signOut(page);
    await signInWithPassword(page, migratedEmail, migratedPassword);
    await assertOneLocalUser(migratedEmail, migrated.clerkUserId);
  });

  await test.step("invalid Clerk and Polar webhook signatures are rejected", async () => {
    const clerkResponse = await request.post("/api/webhooks/clerk", { data: {} });
    const polarResponse = await request.post("/api/webhooks/polar", { data: {} });
    expect(clerkResponse.status()).toBe(400);
    expect(polarResponse.status()).toBe(401);
  });
});
