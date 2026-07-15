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
import { generateTOTP } from "./totp";

test.describe.configure({ mode: "serial" });

const clerk = createClerkClient({ secretKey: requireEnvironment("CLERK_SECRET_KEY") });
const runTag = createE2ERunTag();
const suffix = runTag.split("-").at(-1) ?? "fixture";
const primaryEmail = `convenio+clerk_test_${suffix}@example.com`;
const primaryPassword = `Conv!${suffix}Pass2026`;
const primaryResetPassword = `Reset!${suffix}Pass2026`;
const migratedEmail = `convenio+clerk_test_migrated_${suffix}@example.com`;
const migratedPassword = `Migrated!${suffix}Pass2026`;
const primaryUsername = `conv_${suffix}_primary`;
const migratedUsername = `conv_${suffix}_migrated`;
const organizationName = `Convenio E2E ${suffix}`;
const organizationSlug = `convenio-e2e-${suffix}`;
const manifest: FixtureManifest = createFixtureManifest(runTag);
const execFileAsync = promisify(execFile);
let migratedFixturePromise: Promise<{ clerkUserId: string; localUserId: number }> | undefined;

type BrowserClerkUser = {
  createTOTP(): Promise<{ secret?: string }>;
  verifyTOTP(input: { code: string }): Promise<unknown>;
};

type BrowserClerk = {
  client: {
    signIn: {
      attemptSecondFactor(input: {
        code: string;
        strategy: "backup_code";
      }): Promise<{ createdSessionId?: string | null; status: string }>;
      status: string | null;
    };
  };
  setActive(input: { session: string }): Promise<unknown>;
  user?: BrowserClerkUser;
};

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

  for (let step = 0; step < 3; step += 1) {
    const username = page.locator('input[name="username"]');
    const verifyEmail = page.getByRole("heading", { name: "Verify your email" });
    await expect
      .poll(
        async () =>
          /\/(getting-started|event-types)/.test(new URL(page.url()).pathname) ||
          page.url().includes("#/verify-email-address") ||
          username.isVisible().catch(() => false) ||
          verifyEmail.isVisible().catch(() => false),
        { timeout: 30_000 }
      )
      .toBe(true);

    if (/\/(getting-started|event-types)/.test(new URL(page.url()).pathname)) return;
    if (await username.isVisible().catch(() => false)) {
      await username.fill(primaryUsername);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      continue;
    }
    if (page.url().includes("#/verify-email-address") || (await verifyEmail.isVisible().catch(() => false))) {
      await page.keyboard.type("424242");
      await page
        .waitForURL((url) => !url.href.includes("#/verify-email-address"), { timeout: 10_000 })
        .catch(() => null);
      if (page.url().includes("#/verify-email-address")) {
        const continueButton = page.getByRole("button", { name: "Continue", exact: true });
        await expect(continueButton).toBeEnabled();
        await continueButton.click();
      }
    }
  }
  await expect(page).toHaveURL(/\/(getting-started|event-types)/, { timeout: 15_000 });
}

async function completePersonalOnboarding(page: Page): Promise<void> {
  if (new URL(page.url()).pathname.startsWith("/getting-started")) {
    await page.getByRole("textbox", { name: "Full name" }).fill("Convenio E2E User");
    await page.getByTestId("connect-calendar-button").click();
    await expect(page).toHaveURL(/\/getting-started\/connected-calendar/);
    await page.getByTestId("skip-step").click();
    await expect(page).toHaveURL(/\/getting-started\/connected-video/);
    await page.getByTestId("skip-step").click();
    await expect(page).toHaveURL(/\/getting-started\/setup-availability/);
    await page.getByTestId("save-availability").click();
    await expect(page).toHaveURL(/\/getting-started\/user-profile/);
    await page.getByRole("button", { name: "Finish", exact: false }).click();
    await expect(page).toHaveURL(/\/event-types/);
    return;
  }

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

async function signInWithPassword(
  page: Page,
  email: string,
  password: string,
  totpSecret?: string
): Promise<void> {
  await page.goto("/auth/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  const clientTrustCodeSent = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        (response.request().postData()?.includes("email_code") ?? false),
      { timeout: 15_000 }
    )
    .catch(() => null);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const verificationCode = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await expect
    .poll(async () => /\/event-types/.test(page.url()) || verificationCode.isVisible().catch(() => false))
    .toBe(true);
  if (await verificationCode.isVisible().catch(() => false)) {
    const isSecondFactor = page.url().includes("/factor-two");
    if (isSecondFactor && !totpSecret) throw new Error("TOTP secret is required for second-factor sign-in");
    if (!isSecondFactor) {
      const response = await clientTrustCodeSent;
      if (!response) throw new Error("Clerk did not issue a client-trust email code");
      expect(response.ok()).toBe(true);
    }
    let code = "424242";
    if (isSecondFactor && totpSecret) code = generateTOTP(totpSecret);
    await verificationCode.fill(code);
    await expect(verificationCode).toHaveValue(code);
    await page.waitForURL(/\/event-types/, { timeout: 5_000 }).catch(async () => {
      await verificationCode.press("Enter");
    });
  }
  await expect(page).toHaveURL(/\/event-types/, { timeout: 15_000 });
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/auth/logout");
  await expect(page).toHaveURL(/\/auth\/login/);
}

async function resetPasswordByEmail(page: Page): Promise<void> {
  await signOut(page);
  await page.getByRole("textbox", { name: "Email address" }).fill(primaryEmail);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Forgot password?", { exact: true }).click();
  const resetCodeSent = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      (response.request().postData()?.includes("reset_password_email_code") ?? false),
    { timeout: 15_000 }
  );
  await page.getByRole("button", { name: "Reset your password", exact: true }).click();
  expect((await resetCodeSent).ok()).toBe(true);

  const resetCode = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await resetCode.fill("424242");
  await expect(resetCode).toHaveValue("424242");
  await page.waitForTimeout(250);
  await resetCode.press("Enter");
  const newPassword = page.locator('input[name="password"]');
  await expect(newPassword).toBeVisible({ timeout: 15_000 });
  await newPassword.fill(primaryResetPassword);
  await page.locator('input[name="confirmPassword"]').fill(primaryResetPassword);
  await page.getByRole("button", { name: "Reset Password", exact: true }).click();
  await expect(page).toHaveURL(/\/event-types/);

  await signOut(page);
  await signInWithPassword(page, primaryEmail, primaryResetPassword);
}

async function enrollAuthenticator(page: Page): Promise<{ backupCode: string; secret: string }> {
  const enrollment = await page.evaluate(async () => {
    const user = (window as Window & { Clerk?: BrowserClerk }).Clerk?.user;
    if (!user) throw new Error("Clerk browser user is unavailable");
    const totp = await user.createTOTP();
    if (!totp.secret) throw new Error("Clerk did not return a TOTP secret");
    return { secret: totp.secret };
  });
  const code = generateTOTP(enrollment.secret);
  await page.evaluate(async (verificationCode) => {
    const user = (window as Window & { Clerk?: BrowserClerk }).Clerk?.user;
    if (!user) throw new Error("Clerk browser user is unavailable");
    await user.verifyTOTP({ code: verificationCode });
  }, code);
  const backupCode = `BCKP-${suffix.toUpperCase()}`;
  const clerkUser = await getSingleClerkUser(primaryEmail);
  const updatedUser = await clerk.users.updateUser(clerkUser.id, { backupCodes: [backupCode] });
  expect(updatedUser.backupCodeEnabled).toBe(true);
  return { backupCode, secret: enrollment.secret };
}

async function signInWithBackupCode(page: Page, backupCode: string): Promise<void> {
  await page.goto("/auth/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(primaryEmail);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="password"]').fill(primaryResetPassword);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForFunction(
    () => (window as Window & { Clerk?: BrowserClerk }).Clerk?.client.signIn.status === "needs_second_factor"
  );
  const completed = await page.evaluate(async (code) => {
    const clerk = (window as Window & { Clerk?: BrowserClerk }).Clerk;
    if (!clerk) throw new Error("Clerk browser client is unavailable");
    const attempt = await clerk.client.signIn.attemptSecondFactor({ code, strategy: "backup_code" });
    if (attempt.status !== "complete" || !attempt.createdSessionId) {
      throw new Error(`Backup-code sign-in did not complete: ${attempt.status}`);
    }
    await clerk.setActive({ session: attempt.createdSessionId });
    return true;
  }, backupCode);
  expect(completed).toBe(true);
  await page.goto("/event-types");
  await expect(page).toHaveURL(/\/event-types/);
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

function migratedBcryptFixture(): Promise<{ clerkUserId: string; localUserId: number }> {
  migratedFixturePromise ??= createMigratedBcryptFixture();
  return migratedFixturePromise;
}

async function tagAndRegisterOrganization(organizationId: number): Promise<string> {
  const organization = await prisma.team.findUnique({
    where: { id: organizationId },
    select: { clerkOrganizationId: true },
  });
  if (!organization?.clerkOrganizationId) throw new Error("Clerk organization projection is missing");
  await clerk.organizations.updateOrganizationMetadata(organization.clerkOrganizationId, {
    publicMetadata: taggedMetadata(runTag),
  });
  await registerFixture(manifest, {
    id: organization.clerkOrganizationId,
    kind: "clerk_organization",
  });
  await prisma.team.update({
    where: { id: organizationId },
    data: { metadata: taggedMetadata(runTag) },
    select: { id: true },
  });
  await registerFixture(manifest, { id: String(organizationId), kind: "local_organization" });
  return organization.clerkOrganizationId;
}

async function callTRPC(
  page: Page,
  endpoint: string,
  input: Record<string, unknown>,
  method: "GET" | "POST"
): Promise<{ body: unknown; status: number }> {
  return page.evaluate(
    async ({ endpoint, input, method }) => {
      const batchInput = { 0: { json: input } };
      const options: RequestInit = { method };
      let url = `/api/trpc/${endpoint}?batch=1`;
      if (method === "GET") url += `&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
      if (method === "POST") {
        options.body = JSON.stringify(batchInput);
        options.headers = { "content-type": "application/json" };
      }
      const response = await fetch(url, options);
      return { body: await response.json(), status: response.status };
    },
    { endpoint, input, method }
  );
}

function readTRPCData<T>(body: unknown): T {
  if (!Array.isArray(body)) throw new Error("Unexpected tRPC batch response");
  const item = body[0] as { result?: { data?: { json?: unknown } } } | undefined;
  if (!item?.result?.data || !("json" in item.result.data)) {
    throw new Error("tRPC response did not contain result data");
  }
  return item.result.data.json as T;
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

test("authenticated organization endpoints create a Free projection and enforce the invite gate", async ({
  page,
}) => {
  await setupClerkTestingToken(page);
  const migrated = await migratedBcryptFixture();
  await signInWithPassword(page, migratedEmail, migratedPassword);
  await assertOneLocalUser(migratedEmail, migrated.clerkUserId);

  const created = await callTRPC(
    page,
    "organizations/create",
    { name: organizationName, slug: organizationSlug },
    "POST"
  );
  expect(created.status).toBe(200);
  const { organizationId } = readTRPCData<{ organizationId: number }>(created.body);
  expect(organizationId).toBeGreaterThan(0);
  await tagAndRegisterOrganization(organizationId);

  const projected = await callTRPC(page, "organizations/get", { organizationId }, "GET");
  expect(projected.status).toBe(200);
  const deniedInvite = await callTRPC(
    page,
    "organizations/invite",
    { email: `invitee+${suffix}@example.com`, organizationId, role: "MEMBER" },
    "POST"
  );
  expect(deniedInvite.status).toBe(403);
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

  await test.step("forgot-password email code resets the password and the replacement signs in", async () => {
    await resetPasswordByEmail(page);
  });

  await test.step("TOTP second factor and one-time backup recovery code both sign in", async () => {
    const { backupCode, secret } = await enrollAuthenticator(page);
    await signOut(page);
    await signInWithPassword(page, primaryEmail, primaryResetPassword, secret);
    await signOut(page);
    await signInWithBackupCode(page, backupCode);
  });

  await test.step("migrated bcrypt user signs in with the unchanged password", async () => {
    const migrated = await migratedBcryptFixture();
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
