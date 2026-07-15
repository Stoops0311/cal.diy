import { beforeEach, describe, expect, it } from "vitest";
import {
  addUpgradeSuccessMarker,
  bindUpgradeIntentToOrganization,
  consumeUpgradeIntent,
  normalizeRelativePath,
  readUpgradeIntent,
  saveUpgradeIntent,
} from "./upgradeIntent";

const storageKey = "convenio:upgrade-intent:v1";
const request = {
  capability: "bookingAudit" as const,
  requiredPlan: "TEAM" as const,
  returnTo: "/booking/book_123/logs?from=bookings#history",
  resume: { kind: "openBookingAudit" as const, bookingUid: "book_123" },
};

describe("upgrade intent", () => {
  beforeEach(() => sessionStorage.clear());

  it.each([
    "https://evil.test/x",
    "//evil.test/x",
    "/\\evil.test/x",
    "/%5Cevil.test/x",
    "/foo\\bar",
    "",
    "pricing",
  ])("rejects unsafe return path %s", (value) => expect(normalizeRelativePath(value)).toBeNull());

  it("canonicalizes a safe relative path", () => {
    expect(normalizeRelativePath("/booking/../booking/book_123/logs?from=bookings#history")).toBe(
      request.returnTo
    );
  });

  it("retains a valid intent until it is consumed", () => {
    expect(saveUpgradeIntent(request, { now: 1_000 })).toBe(true);
    expect(readUpgradeIntent(1_000)).toMatchObject({ ...request, createdAt: 1_000, version: 1 });
    expect(readUpgradeIntent(1_000)).not.toBeNull();
    expect(consumeUpgradeIntent(1_000)).toMatchObject(request);
    expect(readUpgradeIntent(1_000)).toBeNull();
  });

  it("expires and removes the intent at thirty minutes", () => {
    saveUpgradeIntent(request, { now: 1_000 });
    expect(readUpgradeIntent(1_000 + 30 * 60 * 1_000 - 1)).not.toBeNull();
    expect(readUpgradeIntent(1_000 + 30 * 60 * 1_000)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it.each([
    "{",
    JSON.stringify({ ...request, version: 1, createdAt: 1_000, extra: "no" }),
    JSON.stringify({ ...request, version: 2, createdAt: 1_000 }),
    JSON.stringify({ ...request, version: 1, createdAt: 1_000, resume: { ...request.resume, extra: true } }),
    JSON.stringify({
      ...request,
      version: 1,
      createdAt: 1_000,
      subject: { kind: "organization", organizationId: 41, extra: true },
    }),
  ])("rejects and removes malformed or non-allowlisted stored shape %#", (stored) => {
    sessionStorage.setItem(storageKey, stored);
    expect(readUpgradeIntent(1_000)).toBeNull();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("binds a newly created organization before Team checkout", () => {
    const now = Date.now();
    saveUpgradeIntent(request, { now });
    bindUpgradeIntentToOrganization(41);
    expect(readUpgradeIntent(now)?.subject).toEqual({ kind: "organization", organizationId: 41 });
  });

  it("adds a small success marker without losing query or hash", () => {
    expect(addUpgradeSuccessMarker("/booking/book_123/logs?from=bookings#history")).toBe(
      "/booking/book_123/logs?from=bookings&upgrade=complete#history"
    );
  });
});
