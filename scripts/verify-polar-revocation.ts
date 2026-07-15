import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { EntitlementService } from "@calcom/features/billing/services/EntitlementService";
import { PolarSdkBillingGateway } from "@calcom/features/billing/services/PolarBillingGateway";
import type { PolarCustomerStateSnapshot } from "@calcom/features/billing/services/PolarSubscriptionProjectionService";
import { PolarSubscriptionProjectionService } from "@calcom/features/billing/services/PolarSubscriptionProjectionService";
import { prisma } from "@calcom/prisma";
import { chromium, expect, type Page } from "@playwright/test";
import { Polar } from "@polar-sh/sdk";

const metadataKey = "convenioE2ERunTag";
const runTag = `convenio-e2e-${new Date()
  .toISOString()
  .replace(/\.\d{3}Z$/, "Z")
  .replace(/[-:]/g, "")}-${randomBytes(4).toString("hex")}`;
const clerkUserId = `user_${randomBytes(12).toString("hex")}`;
const email = `convenio+polar_revoke_${randomBytes(6).toString("hex")}@gmail.com`;
const reportPath: string = path.join("test-results", "clerk-polar", `${runTag}-revocation.json`);

type Evidence = {
  checkoutConfirmations: number[];
  checkoutMutationStatuses: number[][];
  checkoutRateLimits: Array<{ retryAfterSeconds?: number }>;
  checkoutSubmitAttempts: number[];
  cleanup: {
    errors: string[];
    customer: "not-created" | "removed" | "skipped";
    localUser: "not-created" | "removed" | "skipped";
    taggedCustomerRemains: boolean | null;
    taggedLocalUserRemains: boolean | null;
  };
  provider: Array<{
    activeSubscriptions: number;
    grantedBenefits: number;
    localPlan: string;
    phase: "activated" | "reactivated" | "revoked";
    providerStatus: string;
  }>;
  runTag: string;
  runFailure: string | null;
  steps: string[];
  status: "failed" | "passed";
  transitions: Array<{ phase: "activated" | "reactivated" | "revoked"; plan: string; status: string }>;
};

class ProbeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProbeError";
  }
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireSandbox(): void {
  if (process.env.POLAR_SERVER !== "sandbox") throw new Error("POLAR_SERVER must be sandbox");
}

function ownsFixture(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as Record<string, unknown>)[metadataKey] === runTag
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function toSafeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const candidate = error as { name?: unknown; status?: unknown; statusCode?: unknown };
  if (candidate.name === "ProbeError" && typeof (candidate as ProbeError).code === "string") {
    return (candidate as ProbeError).code;
  }
  let name = "unknown";
  if (typeof candidate.name === "string") name = candidate.name;
  let status: unknown = candidate.status;
  if (typeof candidate.statusCode === "number") status = candidate.statusCode;
  if (typeof status === "number") return `${name}:${status}`;
  return name;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown; statusCode?: unknown };
  return candidate.name === "ResourceNotFound" || candidate.status === 404 || candidate.statusCode === 404;
}

async function selectPolarCombobox(page: Page, value: string): Promise<void> {
  const comboboxes = page.getByRole("combobox");
  const labels = await comboboxes.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).innerText.trim())
  );
  let acceptedLabels = new Set(["State", "California"]);
  if (value === "United States") acceptedLabels = new Set(["Country", "United States"]);
  const index = labels.findIndex((label) => acceptedLabels.has(label));
  if (index < 0 && value === "United States") return;
  if (index < 0) throw new ProbeError("polar_checkout_combobox_missing");
  if (labels[index] === value) return;
  const combobox = comboboxes.nth(index);
  await combobox.click();
  await page.getByRole("option").filter({ hasText: value }).first().click();
}

async function completeCheckout(
  url: string,
  mutationStatuses: number[],
  rateLimits: Array<{ retryAfterSeconds?: number }>
): Promise<{ confirmationStatus: number; submitAttempts: number }> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const mutations: Array<{ path: string; status: number }> = [];
    page.on("response", (response) => {
      if (response.request().method() === "POST" && new URL(response.url()).hostname.endsWith("polar.sh")) {
        const mutation = { path: new URL(response.url()).pathname, status: response.status() };
        mutations.push(mutation);
        mutationStatuses.push(mutation.status);
        if (mutation.status === 429) {
          const retryAfter = Number.parseInt(response.headers()["retry-after"] ?? "", 10);
          if (Number.isFinite(retryAfter) && retryAfter >= 0) {
            rateLimits.push({ retryAfterSeconds: retryAfter });
          } else {
            rateLimits.push({});
          }
        }
      }
    });
    try {
      await page.goto(url, { timeout: 60_000, waitUntil: "domcontentloaded" });
      await selectPolarCombobox(page, "United States");
      const payment = page.frameLocator("iframe").first();
      const cardNumber = payment.getByRole("textbox", { name: "Card number" });
      const requiresNewCard = await cardNumber
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (requiresNewCard) {
        await cardNumber.fill("4242424242424242");
        await payment.getByRole("textbox", { name: "Expiration date MM / YY" }).fill("12/34");
        await payment.getByRole("textbox", { name: "Security code" }).fill("123");
        const cardholder = page.getByRole("textbox", { name: "Cardholder name" });
        if (await cardholder.isVisible().catch(() => false)) await cardholder.fill("Convenio E2E User");
        const streetAddress = page.getByRole("textbox", { name: "Street address" });
        await expect(streetAddress).toBeVisible({ timeout: 15_000 });
        await streetAddress.fill("510 Townsend St");
        await page.getByRole("textbox", { name: "Postal code" }).fill("94103");
        await page.getByRole("textbox", { name: "City" }).fill("San Francisco");
        await selectPolarCombobox(page, "California");
      }
      const checkoutReturn = /http:\/\/localhost:3000\/settings\/billing/;
      const submit = page.getByRole("button", { name: /^(Start trial|Subscribe now)$/ }).last();
      await expect(submit).toBeEnabled({ timeout: 30_000 });
      const confirmationsBeforeSubmit = mutations.filter(({ path }) => path.endsWith("/confirm")).length;
      await submit.click();
      let submitAttempts = 1;
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
        if (mutations.some(({ status }) => status === 429))
          throw new ProbeError("polar_checkout_rate_limited");
        if (mutations.some(({ status }) => status === 409)) throw new ProbeError("polar_checkout_locked");
        await expect(submit).toBeEnabled({ timeout: 5_000 });
        await submit.click();
        submitAttempts += 1;
      }
      await expect
        .poll(
          () =>
            mutations.filter(({ path }) => path.endsWith("/confirm")).length > confirmationsBeforeSubmit ||
            checkoutReturn.test(page.url()),
          { timeout: 20_000 }
        )
        .toBe(true);
      const confirmation = mutations.filter(({ path }) => path.endsWith("/confirm")).at(-1);
      if (!confirmation) throw new ProbeError("polar_checkout_confirmation_timeout");
      if (confirmation.status === 429) throw new ProbeError("polar_checkout_rate_limited");
      if (confirmation.status === 409) throw new ProbeError("polar_checkout_locked");
      if (confirmation.status >= 400) throw new ProbeError("polar_checkout_confirmation_rejected");
      return { confirmationStatus: confirmation.status, submitAttempts };
    } catch (error) {
      let classifiedError = error;
      if (mutations.some(({ status }) => status === 429)) {
        classifiedError = new ProbeError("polar_checkout_rate_limited");
      } else if (mutations.some(({ status }) => status === 409)) {
        classifiedError = new ProbeError("polar_checkout_locked");
      }
      await page
        .screenshot({
          fullPage: true,
          path: path.join("test-results", "clerk-polar", `${runTag}-checkout-failure.png`),
        })
        .catch(() => null);
      throw classifiedError;
    }
  } finally {
    await browser.close();
  }
}

async function writeReport(report: Evidence): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function waitForPaidState(
  gateway: PolarSdkBillingGateway,
  externalCustomerId: string
): Promise<PolarCustomerStateSnapshot> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const state = await gateway.getCustomerState(externalCustomerId);
      if (state.subscriptionId && state.activeBenefits.includes("convenio-pro")) return state;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new ProbeError("polar_paid_state_timeout");
}

async function waitForRevokedState(
  gateway: PolarSdkBillingGateway,
  externalCustomerId: string
): Promise<PolarCustomerStateSnapshot> {
  const deadline = Date.now() + 45_000;
  let state = await gateway.getCustomerState(externalCustomerId);
  while ((state.subscriptionId || state.activeBenefits.length > 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    state = await gateway.getCustomerState(externalCustomerId);
  }
  if (state.subscriptionId || state.activeBenefits.length > 0) {
    throw new ProbeError("polar_revoked_state_timeout");
  }
  return state;
}

async function cleanupCustomer({
  customerId,
  externalCustomerId,
  polar,
  report,
}: {
  customerId: string;
  externalCustomerId: string;
  polar: Polar;
  report: Evidence;
}): Promise<void> {
  try {
    const customer = await polar.customers.get({ id: customerId });
    if (!ownsFixture(customer.metadata)) {
      report.cleanup.customer = "skipped";
      report.cleanup.taggedCustomerRemains = false;
      return;
    }
    const state = await polar.customers.getStateExternal({ externalId: externalCustomerId });
    if (state.id !== customerId) throw new Error("Polar customer ownership mismatch during cleanup");
    for (const active of state.activeSubscriptions) {
      const subscription = await polar.subscriptions.get({ id: active.id });
      if (subscription.customer.id !== customerId) {
        throw new Error("Polar subscription ownership mismatch during cleanup");
      }
      await polar.subscriptions.revoke({ id: subscription.id });
    }
    await polar.customers.delete({ id: customerId });
    report.cleanup.customer = "removed";
  } catch (error) {
    report.cleanup.errors.push(`customer:${toSafeErrorCode(error)}`);
  }

  try {
    const customer = await polar.customers.get({ id: customerId });
    report.cleanup.taggedCustomerRemains = ownsFixture(customer.metadata);
  } catch (error) {
    if (isNotFound(error)) report.cleanup.taggedCustomerRemains = false;
    else report.cleanup.errors.push(`customer-audit:${toSafeErrorCode(error)}`);
  }
}

async function cleanupLocalUser({
  clerkUserId,
  localUserId,
  report,
}: {
  clerkUserId: string;
  localUserId: number;
  report: Evidence;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: localUserId },
      select: { clerkUserId: true, metadata: true },
    });
    if (user?.clerkUserId === clerkUserId && ownsFixture(user.metadata)) {
      await prisma.user.delete({ where: { id: localUserId }, select: { id: true } });
      report.cleanup.localUser = "removed";
    } else {
      report.cleanup.localUser = "skipped";
    }
  } catch (error) {
    report.cleanup.errors.push(`local-user:${toSafeErrorCode(error)}`);
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: localUserId }, select: { metadata: true } });
    report.cleanup.taggedLocalUserRemains = Boolean(user && ownsFixture(user.metadata));
  } catch (error) {
    report.cleanup.errors.push(`local-user-audit:${toSafeErrorCode(error)}`);
  }
}

async function verifyLifecycle({
  customerId,
  entitlements,
  externalCustomerId,
  gateway,
  localUserId,
  polar,
  productId,
  projection,
  report,
}: {
  customerId: string;
  entitlements: EntitlementService;
  externalCustomerId: string;
  gateway: PolarSdkBillingGateway;
  localUserId: number;
  polar: Polar;
  productId: string;
  projection: PolarSubscriptionProjectionService;
  report: Evidence;
}): Promise<void> {
  for (const phase of ["activated", "reactivated"] as const) {
    const checkout = await polar.checkouts.create({
      allowTrial: false,
      customerId,
      customerMetadata: { [metadataKey]: runTag },
      products: [productId],
      returnUrl: "http://localhost:3000/settings/billing",
      successUrl: "http://localhost:3000/settings/billing?checkout_id={CHECKOUT_ID}",
    });
    const mutationStatuses: number[] = [];
    report.checkoutMutationStatuses.push(mutationStatuses);
    const checkoutResult = await completeCheckout(checkout.url, mutationStatuses, report.checkoutRateLimits);
    report.checkoutConfirmations.push(checkoutResult.confirmationStatus);
    report.checkoutSubmitAttempts.push(checkoutResult.submitAttempts);
    report.steps.push(`${phase}:checkout-confirmed`);
    const state = await waitForPaidState(gateway, externalCustomerId);
    report.steps.push(`${phase}:state-read`);
    await projection.projectCustomerState(state);
    report.steps.push(`${phase}:projection-applied`);
    const local = await entitlements.forUser(localUserId);
    report.steps.push(`${phase}:entitlement-read`);
    report.provider.push({
      activeSubscriptions: 1,
      grantedBenefits: state.activeBenefits.length,
      localPlan: local.effectivePlan,
      phase,
      providerStatus: state.status,
    });
    if (local.effectivePlan !== "PRO") throw new Error(`${phase} entitlement did not become PRO`);
    if (!state.subscriptionId) throw new Error(`${phase} subscription is missing`);
    report.transitions.push({ phase, plan: local.effectivePlan, status: state.status });
    if (phase !== "activated") continue;

    await polar.subscriptions.revoke({ id: state.subscriptionId });
    const revoked = await waitForRevokedState(gateway, externalCustomerId);
    report.steps.push("revoked:state-read");
    await projection.projectCustomerState(revoked);
    report.steps.push("revoked:projection-applied");
    const revokedLocal = await entitlements.forUser(localUserId);
    report.steps.push("revoked:entitlement-read");
    report.provider.push({
      activeSubscriptions: 0,
      grantedBenefits: revoked.activeBenefits.length,
      localPlan: revokedLocal.effectivePlan,
      phase: "revoked",
      providerStatus: revoked.status,
    });
    report.transitions.push({ phase: "revoked", plan: revokedLocal.effectivePlan, status: revoked.status });
    if (
      revoked.subscriptionId ||
      revoked.activeBenefits.length !== 0 ||
      revokedLocal.effectivePlan !== "FREE"
    ) {
      throw new Error("revocation did not remove paid state and local paid access");
    }
  }
}

async function main(): Promise<void> {
  requireSandbox();
  const polar = new Polar({ accessToken: requireEnvironment("POLAR_ACCESS_TOKEN"), server: "sandbox" });
  const productId = requireEnvironment("POLAR_PRO_MONTHLY_PRODUCT_ID");
  const gateway = new PolarSdkBillingGateway(process.env);
  const projection = new PolarSubscriptionProjectionService(process.env);
  const entitlements = new EntitlementService();
  const report: Evidence = {
    checkoutConfirmations: [],
    checkoutMutationStatuses: [],
    checkoutRateLimits: [],
    checkoutSubmitAttempts: [],
    cleanup: {
      customer: "not-created",
      errors: [],
      localUser: "not-created",
      taggedCustomerRemains: null,
      taggedLocalUserRemains: null,
    },
    provider: [],
    runTag,
    runFailure: null,
    status: "failed",
    steps: [],
    transitions: [],
  };
  let customerId: string | undefined;
  let localUserId: number | undefined;
  let runError: unknown;
  const externalCustomerId = `user:${clerkUserId}`;

  try {
    const user = await prisma.user.create({
      data: {
        clerkUserId,
        completedOnboarding: true,
        email,
        metadata: { [metadataKey]: runTag },
        name: "Polar revoke E2E",
      },
      select: { id: true },
    });
    localUserId = user.id;
    const customer = await polar.customers.create({
      email,
      externalId: externalCustomerId,
      metadata: { [metadataKey]: runTag },
      name: "Polar revoke E2E",
      type: "individual",
    });
    customerId = customer.id;

    await verifyLifecycle({
      customerId,
      entitlements,
      externalCustomerId,
      gateway,
      localUserId,
      polar,
      productId,
      projection,
      report,
    });
  } catch (error) {
    runError = error;
    report.runFailure = toSafeErrorCode(error);
  } finally {
    if (customerId) await cleanupCustomer({ customerId, externalCustomerId, polar, report });
    if (localUserId) await cleanupLocalUser({ clerkUserId, localUserId, report });
    const cleanupPassed =
      report.cleanup.errors.length === 0 &&
      !report.cleanup.taggedCustomerRemains &&
      !report.cleanup.taggedLocalUserRemains;
    if (!runError && cleanupPassed) report.status = "passed";
    await writeReport(report);
  }
  if (runError) throw runError;
  if (report.status !== "passed") throw new Error("live probe cleanup audit failed");
}

main().catch((error: unknown) => {
  process.stderr.write(`${toErrorMessage(error)}\n`);
  process.exitCode = 1;
});
