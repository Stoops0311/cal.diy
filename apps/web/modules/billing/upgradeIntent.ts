import { sessionStorage } from "@calcom/lib/webstorage";

type UpgradeCapability = "bookingAudit";
type UpgradeResume = { kind: "openBookingAudit"; bookingUid: string };
type UpgradeBillingSubject = { kind: "user" } | { kind: "organization"; organizationId: number };
type UpgradeIntentRequest = {
  capability: UpgradeCapability;
  requiredPlan: "PRO" | "TEAM";
  returnTo: string;
  resume: UpgradeResume;
};
type UpgradeIntentV1 = UpgradeIntentRequest & {
  version: 1;
  createdAt: number;
  subject?: UpgradeBillingSubject;
};

const STORAGE_KEY = "convenio:upgrade-intent:v1";
const MAX_AGE_MS: number = 30 * 60 * 1_000;
const BASE_ORIGIN = "https://convenio.local";

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRelativePath(value: string): string | null {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /%5c/i.test(value) ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Unsafe URL controls are rejected before parsing.
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  try {
    const url = new URL(value, BASE_ORIGIN);
    if (url.origin !== BASE_ORIGIN) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function parseResume(value: unknown): UpgradeResume | null {
  if (!isRecord(value) || !hasExactKeys(value, ["kind", "bookingUid"])) return null;
  if (value.kind !== "openBookingAudit") return null;
  if (typeof value.bookingUid !== "string" || value.bookingUid.length < 1 || value.bookingUid.length > 128) {
    return null;
  }
  return { kind: "openBookingAudit", bookingUid: value.bookingUid };
}

function parseSubject(value: unknown): UpgradeBillingSubject | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "user" && hasExactKeys(value, ["kind"])) return { kind: "user" };
  if (
    value.kind === "organization" &&
    hasExactKeys(value, ["kind", "organizationId"]) &&
    Number.isInteger(value.organizationId) &&
    Number(value.organizationId) > 0
  ) {
    return { kind: "organization", organizationId: Number(value.organizationId) };
  }
  return null;
}

function parseIntent(value: unknown, now: number): UpgradeIntentV1 | null {
  if (!isRecord(value)) return null;
  const expectedKeys = ["capability", "createdAt", "requiredPlan", "resume", "returnTo", "version"];
  if (value.subject !== undefined) expectedKeys.push("subject");
  if (!hasExactKeys(value, expectedKeys)) return null;
  let returnTo = null;
  if (typeof value.returnTo === "string") returnTo = normalizeRelativePath(value.returnTo);
  const resume = parseResume(value.resume);
  const subject = parseSubject(value.subject);
  if (
    value.version !== 1 ||
    value.capability !== "bookingAudit" ||
    (value.requiredPlan !== "PRO" && value.requiredPlan !== "TEAM") ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt) ||
    now - value.createdAt < 0 ||
    now - value.createdAt >= MAX_AGE_MS ||
    !returnTo ||
    !resume ||
    subject === null
  ) {
    return null;
  }
  const intent: UpgradeIntentV1 = {
    version: 1,
    capability: "bookingAudit",
    requiredPlan: value.requiredPlan,
    returnTo,
    resume,
    createdAt: value.createdAt,
  };
  if (subject) intent.subject = subject;
  return intent;
}

function saveUpgradeIntent(
  request: UpgradeIntentRequest,
  options: { now?: number; subject?: UpgradeBillingSubject } = {}
): boolean {
  const returnTo = normalizeRelativePath(request.returnTo);
  const resume = parseResume(request.resume);
  const subject = parseSubject(options.subject);
  const createdAt = options.now ?? Date.now();
  if (
    !returnTo ||
    !resume ||
    request.capability !== "bookingAudit" ||
    (request.requiredPlan !== "PRO" && request.requiredPlan !== "TEAM") ||
    subject === null ||
    !Number.isFinite(createdAt)
  ) {
    return false;
  }
  const intent: UpgradeIntentV1 = {
    capability: "bookingAudit",
    requiredPlan: request.requiredPlan,
    returnTo,
    resume,
    version: 1,
    createdAt,
  };
  if (subject) intent.subject = subject;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  return true;
}

function readUpgradeIntent(now: number = Date.now()): UpgradeIntentV1 | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const intent = parseIntent(JSON.parse(raw), now);
    if (intent) return intent;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  sessionStorage.removeItem(STORAGE_KEY);
  return null;
}

function consumeUpgradeIntent(now: number = Date.now()): UpgradeIntentV1 | null {
  const intent = readUpgradeIntent(now);
  if (intent) sessionStorage.removeItem(STORAGE_KEY);
  return intent;
}

function bindUpgradeIntentToOrganization(organizationId: number): void {
  const intent = readUpgradeIntent();
  if (!intent || intent.requiredPlan !== "TEAM" || !Number.isInteger(organizationId) || organizationId < 1) {
    return;
  }
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...intent, subject: { kind: "organization", organizationId } })
  );
}

function addUpgradeSuccessMarker(returnTo: string): string {
  const safePath = normalizeRelativePath(returnTo) ?? "/settings/billing";
  const url = new URL(safePath, BASE_ORIGIN);
  url.searchParams.set("upgrade", "complete");
  return `${url.pathname}${url.search}${url.hash}`;
}

export type {
  UpgradeBillingSubject,
  UpgradeCapability,
  UpgradeIntentRequest,
  UpgradeIntentV1,
  UpgradeResume,
};
export {
  addUpgradeSuccessMarker,
  bindUpgradeIntentToOrganization,
  consumeUpgradeIntent,
  normalizeRelativePath,
  readUpgradeIntent,
  saveUpgradeIntent,
};
