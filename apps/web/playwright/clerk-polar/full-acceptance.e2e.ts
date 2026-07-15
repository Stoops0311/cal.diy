import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";
import { prisma } from "@calcom/prisma";
import { createClerkClient } from "@clerk/backend";
import { expect, type Page, test } from "@playwright/test";
import { Polar } from "@polar-sh/sdk";
import { hash } from "bcryptjs";
import { migrateUserToClerk } from "../../../../packages/features/auth/scripts/importUsersToClerk";
import { assertOneLocalUser, waitForOneLocalUser } from "./databaseAssertions";
import {
  createE2ERunTag,
  createFixtureManifest,
  type FixtureManifest,
  isRecoverableInterruptedSignup,
  isRecoverableUnprovisionedSignup,
  ownsRunTag,
  registerFixture,
  taggedMetadata,
  writeFixtureManifest,
} from "./fixtures";
import { generateTOTP } from "./totp";

test.describe.configure({ mode: "serial" });

const clerk = createClerkClient({ secretKey: requireEnvironment("CLERK_SECRET_KEY") });
const polar = new Polar({
  accessToken: requireEnvironment("POLAR_ACCESS_TOKEN"),
  server: process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
});
const runTag = createE2ERunTag();
const suffix = runTag.split("-").at(-1) ?? "fixture";
const primaryEmail = `convenio+clerk_test_${suffix}@example.com`;
const primaryPassword = `Conv!${suffix}Pass2026`;
const primaryResetPassword = `Reset!${suffix}Pass2026`;
const migratedEmail = `convenio+clerk_test_migrated_${suffix}@gmail.com`;
const migratedPassword = `Migrated!${suffix}Pass2026`;
const teamMemberEmail = `convenio+clerk_test_member_${suffix}@gmail.com`;
const teamMemberPassword = `Member!${suffix}Pass2026`;
const primaryUsername = `conv_${suffix}_primary`;
const migratedUsername = `conv_${suffix}_migrated`;
const teamMemberUsername = `conv_${suffix}_member`;
const organizationName = `Convenio E2E ${suffix}`;
const organizationSlug = `convenio-e2e-${suffix}`;
const manifest: FixtureManifest = createFixtureManifest(runTag);
const execFileAsync = promisify(execFile);
let migratedFixturePromise: Promise<{ clerkUserId: string; localUserId: number }> | undefined;
let teamMemberFixturePromise: Promise<string> | undefined;
let organizationFixtureId: number | undefined;

type BrowserClerkUser = {
  createTOTP(): Promise<{ secret?: string }>;
  getOrganizationInvitations(): Promise<{
    data: Array<{
      accept(): Promise<unknown>;
      publicOrganizationData: { id: string };
    }>;
  }>;
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

async function removeRecoverableUnprovisionedSignup(): Promise<boolean> {
  const users = await clerk.users.getUserList({ emailAddress: [primaryEmail], limit: 2 });
  if (users.data.length === 0) return false;
  if (users.data.length !== 1 || !users.data[0]) {
    throw new Error(`Refusing to remove ambiguous unprovisioned signup for ${primaryEmail}`);
  }

  const clerkUser = users.data[0];
  const recoverable = isRecoverableUnprovisionedSignup(
    {
      clerkExternalId: clerkUser.externalId,
      clerkMetadata: clerkUser.publicMetadata,
      createdAt: clerkUser.createdAt,
      email: primaryEmail,
    },
    runTag,
    Date.parse(manifest.createdAt)
  );
  if (!recoverable) {
    throw new Error(`Refusing to remove an unprovisioned signup without exact ownership`);
  }

  await clerk.users.deleteUser(clerkUser.id);
  return true;
}

async function completeSignUp(page: Page, attempt = 1): Promise<void> {
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
      const codeInput = page.getByRole("textbox", { name: "Enter verification code" });
      if (await codeInput.isVisible().catch(() => false)) await codeInput.fill("424242");
      else await page.keyboard.type("424242");
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

  const missingAttempt = page.getByText("No sign up attempt was found", { exact: false });
  if (attempt < 2 && (await missingAttempt.isVisible().catch(() => false))) {
    await removeRecoverableUnprovisionedSignup();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.context().clearCookies();
    await page.goto("about:blank");
    await completeSignUp(page, attempt + 1);
    return;
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
  await page
    .goto("/auth/login", { timeout: 60_000, waitUntil: "domcontentloaded" })
    .catch((error: unknown) => {
      if (!page.url().includes("/auth/login")) throw error;
    });
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
    await page.waitForURL(/\/event-types/, { timeout: 5_000 }).catch(() => null);
    if (!page.url().includes("/event-types") && (await verificationCode.isVisible().catch(() => false))) {
      await verificationCode.press("Enter");
    }
  }
  await expect(page).toHaveURL(/\/event-types/, { timeout: 45_000 });
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/auth/logout");
  await expect(page).toHaveURL(/\/auth\/login/);
}

async function tagPolarCustomer(externalCustomerId: string): Promise<void> {
  const customer = await polar.customers.getExternal({ externalId: externalCustomerId });
  await polar.customers.update({
    id: customer.id,
    customerUpdate: { metadata: taggedMetadata(runTag) },
  });
  await registerFixture(manifest, { id: customer.id, kind: "polar_customer" });
}

async function selectPolarCombobox(page: Page, value: string): Promise<void> {
  const comboboxes = page.getByRole("combobox");
  const labels = await comboboxes.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).innerText.trim())
  );
  const acceptedLabels =
    value === "United States" ? new Set(["Country", "United States"]) : new Set(["State", "California"]);
  const index = labels.findIndex((label) => acceptedLabels.has(label));
  if (index < 0 && value === "United States") return;
  expect(index, `Polar checkout comboboxes: ${labels.join(", ")}`).toBeGreaterThanOrEqual(0);
  const combobox = comboboxes.nth(index);
  await combobox.focus();
  await combobox.press("Enter");
  await page
    .getByRole("option", { name: value, exact: true })
    .evaluate((option: HTMLElement) => option.click());
  if (value === "United States") return;
  await expect(page.getByRole("combobox").filter({ hasText: value })).toBeVisible({ timeout: 5_000 });
}

async function completePolarCardCheckout(page: Page, externalCustomerId: string): Promise<void> {
  const checkoutReturn = /http:\/\/localhost:3000\/(?:settings\/billing\?checkout_id=|auth\/login)/;
  const mutations: Array<{ host: string; method: string; path: string; status: number }> = [];
  const failedMutations: Array<{ body: string; path: string; retryAfter: number | null; status: number }> =
    [];
  const browserErrors: string[] = [];
  page.on("response", async (response) => {
    const method = response.request().method();
    if (method === "GET" || method === "OPTIONS") return;
    const url = new URL(response.url());
    if (!url.hostname.endsWith("polar.sh") && !url.hostname.endsWith("stripe.com")) return;
    mutations.push({ host: url.hostname, method, path: url.pathname, status: response.status() });
    if (response.status() >= 400) {
      failedMutations.push({
        body: (await response.text().catch(() => "unavailable")).slice(0, 500),
        path: url.pathname,
        retryAfter: Number.parseInt(response.headers()["retry-after"] ?? "", 10) || null,
        status: response.status(),
      });
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await selectPolarCombobox(page, "United States");
  const payment = page.frameLocator("iframe").first();
  await payment.getByRole("textbox", { name: "Card number" }).fill("4242424242424242");
  await payment.getByRole("textbox", { name: "Expiration date MM / YY" }).fill("12/34");
  await payment.getByRole("textbox", { name: "Security code" }).fill("123");
  const cardholderName = page.getByRole("textbox", { name: "Cardholder name" });
  if (await cardholderName.isVisible().catch(() => false)) await cardholderName.fill("Convenio E2E User");
  const streetAddress = page.getByRole("textbox", { name: "Street address" });
  await expect(streetAddress).toBeVisible({ timeout: 15_000 });
  await streetAddress.fill("510 Townsend St");
  await page.getByRole("textbox", { name: "Postal code" }).fill("94103");
  await page.getByRole("textbox", { name: "City" }).fill("San Francisco");
  await selectPolarCombobox(page, "California");
  const businessName = page.getByRole("textbox", { name: "Business name" });
  if (await businessName.isVisible().catch(() => false)) await businessName.fill(organizationName);

  const submit = page.getByRole("button", { name: /^(Start trial|Subscribe now)$/ }).last();
  await expect(submit).toBeEnabled();
  const confirmationsBeforeSubmit = mutations.filter(({ path }) => path.endsWith("/confirm")).length;
  await submit.click();
  await expect
    .poll(
      () =>
        mutations.filter(({ path }) => path.endsWith("/confirm")).length > confirmationsBeforeSubmit ||
        checkoutReturn.test(page.url()),
      { timeout: 20_000 }
    )
    .toBe(true)
    .catch(() => null);
  if (
    mutations.filter(({ path }) => path.endsWith("/confirm")).length === confirmationsBeforeSubmit &&
    !checkoutReturn.test(page.url())
  ) {
    const settledSubmit = page.getByRole("button", { name: /^(Start trial|Subscribe now)$/ }).last();
    await expect(settledSubmit).toBeEnabled({ timeout: 20_000 });
    await settledSubmit.click();
  }
  await expect
    .poll(
      () =>
        mutations.filter(({ path }) => path.endsWith("/confirm")).length > confirmationsBeforeSubmit ||
        checkoutReturn.test(page.url()),
      { timeout: 20_000 }
    )
    .toBe(true);
  const latestConfirmation = mutations.filter(({ path }) => path.endsWith("/confirm")).at(-1);
  if (latestConfirmation?.status === 403) {
    const subscribeNow = page.getByRole("button", { name: "Subscribe now", exact: true });
    await expect(subscribeNow).toBeEnabled({ timeout: 45_000 });
    await page.waitForTimeout(10_000);
    await subscribeNow.click();
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const confirmation = mutations.filter(({ path }) => path.endsWith("/confirm")).at(-1);
    const failure = failedMutations.filter(({ path }) => path.endsWith("/confirm")).at(-1);
    const checkoutLocked = confirmation?.status === 409 && failure?.body.includes('"error":"CheckoutLocked"');
    const throttledAfterLock =
      confirmation?.status === 429 &&
      failedMutations.some(
        ({ body, path, status }) =>
          path.endsWith("/confirm") && status === 409 && body.includes('"error":"CheckoutLocked"')
      );
    if (!checkoutLocked && !throttledAfterLock) break;
    const retryAfter = failure?.retryAfter ?? 0;
    let minimumDelay = 10_000;
    if (throttledAfterLock) minimumDelay = 15_000;
    const retryDelay = Math.max(retryAfter * 1_000, minimumDelay);
    if (retryDelay > 45_000) break;
    await page.waitForTimeout(retryDelay);
    const retrySubmit = page.getByRole("button", { name: /^(Start trial|Subscribe now)$/ }).last();
    await expect(retrySubmit).toBeEnabled({ timeout: 30_000 });
    const confirmationCount = mutations.filter(({ path }) => path.endsWith("/confirm")).length;
    await retrySubmit.click();
    await expect
      .poll(
        () =>
          mutations.filter(({ path }) => path.endsWith("/confirm")).length > confirmationCount ||
          checkoutReturn.test(page.url()),
        { timeout: 20_000 }
      )
      .toBe(true);
    if (checkoutReturn.test(page.url())) break;
  }
  await page.waitForURL(checkoutReturn, { timeout: 60_000 }).catch(() => null);
  const confirmationSucceeded = mutations.some(
    ({ path, status }) => path.endsWith("/confirm") && status >= 200 && status < 300
  );
  if (!checkoutReturn.test(page.url()) || !confirmationSucceeded) {
    throw new Error(
      `Polar checkout did not redirect. Mutations: ${JSON.stringify(mutations)}. Failures: ${JSON.stringify(failedMutations)}. Browser errors: ${JSON.stringify(browserErrors)}`
    );
  }
  await expect(page).toHaveURL(checkoutReturn);
  await tagPolarCustomer(externalCustomerId);
}

async function tagAndRegisterPolarSubscription(externalCustomerId: string): Promise<void> {
  await tagPolarCustomer(externalCustomerId);
  const state = await polar.customers.getStateExternal({ externalId: externalCustomerId });
  const subscription = state.activeSubscriptions[0];
  if (!subscription) throw new Error("Polar customer state is missing an active subscription");
  await registerFixture(manifest, { id: subscription.id, kind: "polar_subscription" });
}

async function registerPersonalProjection(userId: number): Promise<void> {
  const subscription = await prisma.billingSubscription.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!subscription) throw new Error("Polar subscription projection is missing");
  await registerFixture(manifest, { id: subscription.id, kind: "local_projection" });
}

async function registerOrganizationProjection(organizationId: number): Promise<void> {
  const subscription = await prisma.billingSubscription.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (!subscription) throw new Error("Polar organization subscription projection is missing");
  await registerFixture(manifest, { id: subscription.id, kind: "local_projection" });
}

async function ensureOrganizationFixture(page: Page): Promise<number> {
  if (organizationFixtureId !== undefined) return organizationFixtureId;
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
  organizationFixtureId = organizationId;
  return organizationId;
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

async function recoverInterruptedPrimarySignup(): Promise<void> {
  const users = await clerk.users.getUserList({ emailAddress: [primaryEmail], limit: 2 });
  if (users.data.length === 0) return;
  if (users.data.length !== 1 || !users.data[0]) {
    throw new Error(`Refusing to recover ambiguous interrupted signup for ${primaryEmail}`);
  }
  const clerkUser = users.data[0];
  const localUser = await prisma.user.findUnique({
    where: { email: primaryEmail },
    select: { clerkUserId: true, email: true, id: true, metadata: true },
  });
  if (!localUser) {
    const recoverable = isRecoverableUnprovisionedSignup(
      {
        clerkExternalId: clerkUser.externalId,
        clerkMetadata: clerkUser.publicMetadata,
        createdAt: clerkUser.createdAt,
        email: primaryEmail,
      },
      runTag,
      Date.parse(manifest.createdAt)
    );
    if (!recoverable) {
      throw new Error(`Refusing to recover an unprovisioned signup without exact ownership`);
    }
    if (!ownsRunTag(clerkUser.publicMetadata, runTag)) {
      await clerk.users.updateUserMetadata(clerkUser.id, { publicMetadata: taggedMetadata(runTag) });
    }
    await registerFixture(manifest, { id: clerkUser.id, kind: "clerk_user" });
    return;
  }

  const recoverable = isRecoverableInterruptedSignup(
    {
      clerkExternalId: clerkUser.externalId,
      clerkMetadata: clerkUser.publicMetadata,
      clerkUserId: clerkUser.id,
      email: localUser.email,
      localMetadata: localUser.metadata,
      localUserId: localUser.id,
      mappedClerkUserId: localUser.clerkUserId,
    },
    runTag
  );
  if (!recoverable) throw new Error(`Refusing to recover an interrupted signup without exact ownership`);

  if (!ownsRunTag(clerkUser.publicMetadata, runTag)) {
    await clerk.users.updateUserMetadata(clerkUser.id, { publicMetadata: taggedMetadata(runTag) });
  }
  await registerFixture(manifest, { id: clerkUser.id, kind: "clerk_user" });
  if (!ownsRunTag(localUser.metadata, runTag)) {
    await prisma.user.update({
      where: { id: localUser.id },
      data: { metadata: taggedMetadata(runTag) },
      select: { id: true },
    });
  }
  await registerFixture(manifest, { id: String(localUser.id), kind: "local_user" });
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

async function createTeamMemberFixture(): Promise<string> {
  const user = await clerk.users.createUser({
    emailAddress: [teamMemberEmail],
    firstName: "Convenio",
    lastName: "Team Member",
    password: teamMemberPassword,
    publicMetadata: taggedMetadata(runTag),
    username: teamMemberUsername,
  });
  await registerFixture(manifest, { id: user.id, kind: "clerk_user" });
  return user.id;
}

function teamMemberFixture(): Promise<string> {
  teamMemberFixturePromise ??= createTeamMemberFixture();
  return teamMemberFixturePromise;
}

async function acceptOrganizationInvitation(page: Page, clerkOrganizationId: string): Promise<void> {
  const accepted = await page.evaluate(async (organizationId) => {
    const user = (window as Window & { Clerk?: BrowserClerk }).Clerk?.user;
    if (!user) throw new Error("Clerk browser user is unavailable");
    const invitations = await user.getOrganizationInvitations();
    const invitation = invitations.data.find(
      ({ publicOrganizationData }) => publicOrganizationData.id === organizationId
    );
    if (!invitation) return false;
    await invitation.accept();
    return true;
  }, clerkOrganizationId);
  expect(accepted).toBe(true);
}

async function verifyTeamMembershipLifecycle(
  page: Page,
  organizationId: number,
  clerkOrganizationId: string
): Promise<void> {
  await teamMemberFixture();
  const invitation = await callTRPC(
    page,
    "organizations/invite",
    { email: teamMemberEmail, organizationId, role: "MEMBER" },
    "POST"
  );
  expect(invitation.status).toBe(200);

  await signOut(page);
  await signInWithPassword(page, teamMemberEmail, teamMemberPassword);
  const member = await tagAndRegisterMappedUser(teamMemberEmail);
  await acceptOrganizationInvitation(page, clerkOrganizationId);

  await expect
    .poll(async () => {
      const membership = await prisma.membership.findUnique({
        where: { userId_teamId: { teamId: organizationId, userId: member.localUserId } },
        select: { accepted: true, role: true },
      });
      const projection = await prisma.billingSubscription.findUnique({
        where: { organizationId },
        select: { seatCount: true },
      });
      return `${membership?.accepted}:${membership?.role}:${projection?.seatCount}`;
    })
    .toBe("true:MEMBER:2");

  await signOut(page);
  await signInWithPassword(page, migratedEmail, migratedPassword);
  const promoted = await callTRPC(
    page,
    "organizations/changeRole",
    { memberUserId: member.localUserId, organizationId, role: "ADMIN" },
    "POST"
  );
  expect(promoted.status).toBe(200);
  await expect
    .poll(() =>
      prisma.membership
        .findUnique({
          where: { userId_teamId: { teamId: organizationId, userId: member.localUserId } },
          select: { role: true },
        })
        .then((membership) => membership?.role)
    )
    .toBe("ADMIN");

  const removed = await callTRPC(
    page,
    "organizations/removeMember",
    { memberUserId: member.localUserId, organizationId },
    "POST"
  );
  expect(removed.status).toBe(200);
  await expect
    .poll(async () => {
      const membership = await prisma.membership.findUnique({
        where: { userId_teamId: { teamId: organizationId, userId: member.localUserId } },
        select: { accepted: true },
      });
      const projection = await prisma.billingSubscription.findUnique({
        where: { organizationId },
        select: { seatCount: true },
      });
      return `${membership?.accepted}:${projection?.seatCount}`;
    })
    .toBe("false:1");
}

async function verifyOrganizationArchiveAndOwnerBoundary(
  page: Page,
  organizationId: number,
  ownerUserId: number
): Promise<void> {
  const removeLastOwner = await callTRPC(
    page,
    "organizations/removeMember",
    { memberUserId: ownerUserId, organizationId },
    "POST"
  );
  expect(removeLastOwner.status).toBe(409);
  await expect(
    prisma.membership.findUnique({
      where: { userId_teamId: { teamId: organizationId, userId: ownerUserId } },
      select: { accepted: true, role: true },
    })
  ).resolves.toEqual({ accepted: true, role: "OWNER" });

  const archived = await callTRPC(page, "organizations/archive", { organizationId }, "POST");
  expect(archived.status).toBe(200);
  await expect
    .poll(() =>
      prisma.team
        .findUnique({ where: { id: organizationId }, select: { archivedAt: true } })
        .then((organization) => organization?.archivedAt?.toISOString() ?? null)
    )
    .not.toBeNull();

  const readable = await callTRPC(page, "organizations/get", { organizationId }, "GET");
  expect(readable.status).toBe(200);
  expect(readTRPCData<{ archivedAt: string }>(readable.body).archivedAt).toMatch(/^20\d{2}-/);
  const readOnly = await callTRPC(
    page,
    "organizations/invite",
    { email: `archived+${suffix}@example.com`, organizationId, role: "MEMBER" },
    "POST"
  );
  expect(readOnly.status).toBe(409);
}

async function verifyPolarCustomerPortal(page: Page, organizationId: number): Promise<void> {
  const session = await callTRPC(page, "billing/createPortalSession", { organizationId }, "POST");
  expect(session.status).toBe(200);
  const { portalUrl } = readTRPCData<{ portalUrl: string }>(session.body);
  await page.goto(portalUrl, { timeout: 60_000, waitUntil: "domcontentloaded" }).catch((error) => {
    if (!page.url().startsWith("https://sandbox.polar.sh/")) throw error;
  });
  await expect(page).toHaveURL(/https:\/\/sandbox\.polar\.sh\//);
  const portal = page.locator("body");
  await expect(portal).toContainText("Convenio Team — Monthly", { timeout: 30_000 });
  const portalText = await portal.innerText();
  expect(portalText).toMatch(/Subscription|Plan/i);
  expect(portalText).toMatch(/Payment|Visa|4242/i);
  expect(portalText).toMatch(/Invoice|Order|Receipt|Billing/i);
  await page.screenshot({
    fullPage: true,
    path: `test-results/clerk-polar/screenshots/${runTag}-polar-customer-portal.png`,
  });

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await signInWithPassword(page, migratedEmail, migratedPassword);
}

async function verifyCancellationRetention(page: Page, organizationId: number): Promise<void> {
  const beforeResult = await callTRPC(page, "billing/get", { organizationId }, "GET");
  const before = readTRPCData<{ currentPeriodEnd: string; plan: string }>(beforeResult.body);
  expect(before.plan).toBe("TEAM");

  const cancellation = await callTRPC(page, "billing/cancelAtPeriodEnd", { organizationId }, "POST");
  expect(cancellation.status).toBe(200);
  await expect
    .poll(async () => {
      const result = await callTRPC(page, "billing/get", { organizationId }, "GET");
      if (result.status !== 200) return null;
      return readTRPCData<{ cancelAtPeriodEnd: boolean }>(result.body).cancelAtPeriodEnd;
    })
    .toBe(true);
  const retainedResult = await callTRPC(page, "billing/get", { organizationId }, "GET");
  const retained = readTRPCData<{
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
    plan: string;
    status: string;
  }>(retainedResult.body);
  expect(retained).toMatchObject({ cancelAtPeriodEnd: true, plan: "TEAM" });
  expect(["ACTIVE", "TRIALING"]).toContain(retained.status);
  expect(retained.currentPeriodEnd).toBe(before.currentPeriodEnd);

  const retainedInvite = await callTRPC(
    page,
    "organizations/invite",
    { email: `retained+${suffix}@gmail.com`, organizationId, role: "MEMBER" },
    "POST"
  );
  expect(retainedInvite.status).toBe(200);
}

async function verifyProApiKeyEntitlement(page: Page, userId: number): Promise<void> {
  const created = await callTRPC(page, "apiKeys/create", { neverExpires: true, note: runTag }, "POST");
  expect(created.status).toBe(200);
  expect(readTRPCData<string>(created.body)).toMatch(/^cal_/);

  const apiKey = await prisma.apiKey.findFirstOrThrow({
    where: { note: runTag, userId },
    select: { id: true },
  });
  const deleted = await callTRPC(page, "apiKeys/delete", { id: apiKey.id }, "POST");
  expect(deleted.status).toBe(200);
  await expect(prisma.apiKey.findUnique({ where: { id: apiKey.id } })).resolves.toBeNull();
}

async function verifyPaidSubjectIsolation(page: Page, organizationId: number): Promise<void> {
  const personal = await callTRPC(page, "billing/get", {}, "GET");
  const organization = await callTRPC(page, "billing/get", { organizationId }, "GET");
  expect(personal.status).toBe(200);
  expect(organization.status).toBe(200);
  expect(readTRPCData<{ plan: string }>(personal.body).plan).toBe("PRO");
  expect(readTRPCData<{ plan: string }>(organization.body).plan).toBe("TEAM");

  const teamWithoutOrganization = await callTRPC(
    page,
    "billing/changePlan",
    { interval: "MONTH", plan: "TEAM" },
    "POST"
  );
  const proForOrganization = await callTRPC(
    page,
    "billing/changePlan",
    { interval: "MONTH", organizationId, plan: "PRO" },
    "POST"
  );
  expect(teamWithoutOrganization.status).toBe(400);
  expect(proForOrganization.status).toBe(400);
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
  try {
    await prisma.apiKey.deleteMany({ where: { note: runTag } });
    await recoverInterruptedPrimarySignup();
  } finally {
    await execFileAsync("yarn", ["clerk-polar:e2e-cleanup", `--run-tag=${runTag}`], {
      cwd: process.cwd(),
      env: process.env,
    });
  }
});

test("authenticated organization endpoints create a Free projection and enforce the invite gate", async ({
  page,
}) => {
  await setupClerkTestingToken(page);
  const migrated = await migratedBcryptFixture();
  await signInWithPassword(page, migratedEmail, migratedPassword);
  await assertOneLocalUser(migratedEmail, migrated.clerkUserId);

  const organizationId = await ensureOrganizationFixture(page);

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

test("all configured Polar products open the expected sandbox checkout", async ({ page }) => {
  await setupClerkTestingToken(page);
  const migrated = await migratedBcryptFixture();
  await signInWithPassword(page, migratedEmail, migratedPassword);
  await assertOneLocalUser(migratedEmail, migrated.clerkUserId);
  const organizationId = await ensureOrganizationFixture(page);

  const products = [
    { input: { interval: "YEAR", plan: "PRO" }, title: "Convenio Pro — Annual" },
    {
      input: { interval: "MONTH", organizationId, plan: "TEAM" },
      title: "Convenio Team — Monthly",
    },
    {
      input: { interval: "YEAR", organizationId, plan: "TEAM" },
      title: "Convenio Team — Annual",
    },
  ] as const;
  const checkouts: Array<{ title: string; url: string }> = [];
  for (const product of products) {
    const result = await callTRPC(page, "billing/createCheckout", product.input, "POST");
    expect(result.status).toBe(200);
    const { checkoutUrl } = readTRPCData<{ checkoutUrl: string }>(result.body);
    checkouts.push({ title: product.title, url: checkoutUrl });
  }
  const organization = await prisma.team.findUniqueOrThrow({
    where: { id: organizationId },
    select: { clerkOrganizationId: true },
  });
  if (!organization.clerkOrganizationId) throw new Error("Clerk organization projection is missing");
  await tagPolarCustomer(`org:${organization.clerkOrganizationId}`);

  for (const checkout of checkouts) {
    await page
      .goto(checkout.url, { timeout: 60_000, waitUntil: "domcontentloaded" })
      .catch((error: unknown) => {
        if (!page.url().startsWith("https://sandbox.polar.sh/checkout/")) throw error;
      });
    await expect(page).toHaveURL(/https:\/\/sandbox\.polar\.sh\/checkout\//);
    await expect(page.getByText(checkout.title, { exact: true })).toBeVisible({ timeout: 30_000 });
  }
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Polar Pro monthly checkout activates a paid projection", async ({ page }) => {
  await setupClerkTestingToken(page);
  const migrated = await migratedBcryptFixture();
  await signInWithPassword(page, migratedEmail, migratedPassword);
  await assertOneLocalUser(migratedEmail, migrated.clerkUserId);

  const projection = await callTRPC(page, "billing/get", {}, "GET");
  expect(projection.status).toBe(200);
  expect(readTRPCData<{ plan: string }>(projection.body).plan).toBe("FREE");

  const checkout = await callTRPC(page, "billing/createCheckout", { interval: "MONTH", plan: "PRO" }, "POST");
  expect(checkout.status).toBe(200);
  const { checkoutUrl } = readTRPCData<{ checkoutUrl: string }>(checkout.body);
  await page.goto(checkoutUrl, { timeout: 60_000, waitUntil: "domcontentloaded" }).catch((error: unknown) => {
    if (!page.url().startsWith("https://sandbox.polar.sh/checkout/")) throw error;
  });
  await expect(page).toHaveURL(/https:\/\/sandbox\.polar\.sh\/checkout\//);
  await page.screenshot({
    fullPage: true,
    path: `test-results/clerk-polar/screenshots/${runTag}-polar-checkout.png`,
  });
  const externalCustomerId = `user:${migrated.clerkUserId}`;
  await completePolarCardCheckout(page, externalCustomerId);
  await tagAndRegisterPolarSubscription(externalCustomerId);
  if (new URL(page.url()).pathname === "/auth/login") {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.context().clearCookies();
    await signInWithPassword(page, migratedEmail, migratedPassword);
  }

  const reconciled = await callTRPC(page, "billing/reconcile", {}, "POST");
  expect(reconciled.status).toBe(200);
  await expect
    .poll(
      async () => {
        const result = await callTRPC(page, "billing/get", {}, "GET");
        if (result.status !== 200) return "ERROR";
        return readTRPCData<{ plan: string }>(result.body).plan;
      },
      { timeout: 30_000 }
    )
    .toBe("PRO");
  const paidProjection = await callTRPC(page, "billing/get", {}, "GET");
  expect(paidProjection.status).toBe(200);
  const paid = readTRPCData<{
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
    currentPeriodStart: string;
    interval: string;
    plan: string;
    seatCount: number;
    status: string;
  }>(paidProjection.body);
  expect(paid).toMatchObject({
    cancelAtPeriodEnd: false,
    interval: "MONTH",
    plan: "PRO",
    seatCount: 1,
    status: "ACTIVE",
  });
  expect(new Date(paid.currentPeriodEnd).getTime()).toBeGreaterThan(
    new Date(paid.currentPeriodStart).getTime()
  );
  await registerPersonalProjection(migrated.localUserId);
  await verifyProApiKeyEntitlement(page, migrated.localUserId);
  await page.screenshot({
    fullPage: true,
    path: `test-results/clerk-polar/screenshots/${runTag}-polar-pro-active.png`,
  });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Polar Team monthly checkout bills accepted Clerk members as seats", async ({ page }) => {
  await setupClerkTestingToken(page);
  const migrated = await migratedBcryptFixture();
  await signInWithPassword(page, migratedEmail, migratedPassword);
  await assertOneLocalUser(migratedEmail, migrated.clerkUserId);
  const organizationId = await ensureOrganizationFixture(page);
  const organization = await prisma.team.findUniqueOrThrow({
    where: { id: organizationId },
    select: { clerkOrganizationId: true },
  });
  if (!organization.clerkOrganizationId) throw new Error("Clerk organization projection is missing");

  const freeProjection = await callTRPC(page, "billing/get", { organizationId }, "GET");
  expect(freeProjection.status).toBe(200);
  expect(readTRPCData<{ plan: string }>(freeProjection.body).plan).toBe("FREE");

  const checkout = await callTRPC(
    page,
    "billing/createCheckout",
    { interval: "MONTH", organizationId, plan: "TEAM" },
    "POST"
  );
  expect(checkout.status).toBe(200);
  const { checkoutUrl } = readTRPCData<{ checkoutUrl: string }>(checkout.body);
  await page.goto(checkoutUrl, { timeout: 60_000, waitUntil: "domcontentloaded" }).catch((error) => {
    if (!page.url().startsWith("https://sandbox.polar.sh/checkout/")) throw error;
  });
  await expect(page.getByText("Convenio Team — Monthly", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({
    fullPage: true,
    path: `test-results/clerk-polar/screenshots/${runTag}-polar-team-checkout.png`,
  });
  const externalCustomerId = `org:${organization.clerkOrganizationId}`;
  await completePolarCardCheckout(page, externalCustomerId);
  await tagAndRegisterPolarSubscription(externalCustomerId);
  if (new URL(page.url()).pathname === "/auth/login") {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.context().clearCookies();
    await signInWithPassword(page, migratedEmail, migratedPassword);
  }

  const reconciled = await callTRPC(page, "billing/reconcile", { organizationId }, "POST");
  expect(reconciled.status).toBe(200);
  await expect
    .poll(
      async () => {
        const result = await callTRPC(page, "billing/get", { organizationId }, "GET");
        if (result.status !== 200) return "ERROR";
        const projection = readTRPCData<{ plan: string; seatCount: number; status: string }>(result.body);
        return `${projection.plan}:${projection.seatCount}`;
      },
      { timeout: 30_000 }
    )
    .toBe("TEAM:1");
  const paidProjection = await callTRPC(page, "billing/get", { organizationId }, "GET");
  const paid = readTRPCData<{ status: string }>(paidProjection.body);
  expect(["ACTIVE", "TRIALING"]).toContain(paid.status);
  await registerOrganizationProjection(organizationId);
  await verifyPolarCustomerPortal(page, organizationId);
  await verifyTeamMembershipLifecycle(page, organizationId, organization.clerkOrganizationId);
  await verifyPaidSubjectIsolation(page, organizationId);
  await verifyCancellationRetention(page, organizationId);
  await page.screenshot({
    fullPage: true,
    path: `test-results/clerk-polar/screenshots/${runTag}-polar-team-active.png`,
  });
  await verifyOrganizationArchiveAndOwnerBoundary(page, organizationId, migrated.localUserId);
  await page.unrouteAll({ behavior: "ignoreErrors" });
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

  await test.step("Google and Microsoft sign-in are enabled without changing local identity ownership", async () => {
    await signOut(page);
    await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in with Microsoft/i })).toBeVisible();
    const migrated = await migratedBcryptFixture();
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
