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
const invitationRequest = {
  capability: "organizationInvitations" as const,
  requiredPlan: "TEAM" as const,
  returnTo: "/onboarding/complete",
  resume: { kind: "openOrganizationInvitations" as const, organizationId: 41 },
};
const organizationSubject = { kind: "organization" as const, organizationId: 41 };
const contextualRequest = {
  capability: "canCreateWebhooks" as const,
  requiredPlan: "PRO" as const,
  returnTo: "/settings/developer/webhooks",
  resume: { kind: "returnToFeature" as const },
};

describe("upgrade intent", () => {
  beforeEach(() => sessionStorage.clear());

  it.each([
    "https://evil.test/x",
    "//evil.test/x",
    "/\\evil.test/x",
    "/%5Cevil.test/x",
    "/foo\\bar",
    "/foo/%2e%2e//evil.test/x",
    "/.%2e//evil.test/x",
    "/foo/..//evil.test/x",
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

  it("stores a strict organization invitation intent with a same-origin return", () => {
    expect(saveUpgradeIntent(invitationRequest, { now: 1_000, subject: organizationSubject })).toBe(true);
    expect(readUpgradeIntent(1_000)).toEqual({
      ...invitationRequest,
      createdAt: 1_000,
      subject: organizationSubject,
      version: 1,
    });
  });

  it("round-trips a contextual gate with the no-payload resume", () => {
    expect(saveUpgradeIntent(contextualRequest, { now: 1_000, subject: { kind: "user" } })).toBe(true);
    expect(readUpgradeIntent(1_000)).toEqual({
      ...contextualRequest,
      createdAt: 1_000,
      subject: { kind: "user" },
      version: 1,
    });
  });

  it("round-trips a Team contextual gate only with an organization subject", () => {
    const teamRequest = { ...contextualRequest, requiredPlan: "TEAM" as const };
    expect(saveUpgradeIntent(teamRequest, { now: 1_000, subject: organizationSubject })).toBe(true);
    expect(readUpgradeIntent(1_000)).toMatchObject({ ...teamRequest, subject: organizationSubject });
  });

  it.each([
    [{ ...contextualRequest }, undefined],
    [{ ...contextualRequest }, organizationSubject],
    [{ ...contextualRequest, requiredPlan: "TEAM" as const }, undefined],
    [{ ...contextualRequest, requiredPlan: "TEAM" as const }, { kind: "user" as const }],
  ])("rejects a contextual plan without its exact billing subject %#", (intent, subject) => {
    expect(saveUpgradeIntent(intent, { now: 1_000, subject })).toBe(false);
  });

  it("expires an organization invitation intent at exactly thirty minutes", () => {
    saveUpgradeIntent(invitationRequest, { now: 1_000, subject: organizationSubject });
    expect(readUpgradeIntent(1_000 + 30 * 60 * 1_000 - 1)).not.toBeNull();
    expect(readUpgradeIntent(1_000 + 30 * 60 * 1_000)).toBeNull();
  });

  it.each([
    [{ ...invitationRequest, requiredPlan: "PRO" as const }, organizationSubject],
    [{ ...invitationRequest, capability: "bookingAudit" as const }, organizationSubject],
    [{ ...request, capability: "organizationInvitations" as const }, organizationSubject],
    [{ ...invitationRequest, resume: { kind: "returnToFeature" as const } }, organizationSubject],
    [invitationRequest, undefined],
    [invitationRequest, { kind: "user" as const }],
    [invitationRequest, { ...organizationSubject, organizationId: 42 }],
    [
      { ...invitationRequest, resume: { ...invitationRequest.resume, organizationId: 0 } },
      organizationSubject,
    ],
    [
      { ...invitationRequest, resume: { ...invitationRequest.resume, organizationId: -1 } },
      organizationSubject,
    ],
    [
      { ...invitationRequest, resume: { ...invitationRequest.resume, organizationId: 1.5 } },
      organizationSubject,
    ],
  ])("rejects mismatched invitation request and subject %#", (intent, subject) => {
    expect(saveUpgradeIntent(intent, { now: 1_000, subject })).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });

  it("rejects extra invitation resume keys from storage", () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        ...invitationRequest,
        createdAt: 1_000,
        resume: { ...invitationRequest.resume, extra: true },
        subject: organizationSubject,
        version: 1,
      })
    );
    expect(readUpgradeIntent(1_000)).toBeNull();
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

  it("does not bind a generic contextual gate to a newly created organization", () => {
    const now = Date.now();
    saveUpgradeIntent(
      { ...contextualRequest, requiredPlan: "TEAM" },
      { now, subject: { kind: "organization", organizationId: 42 } }
    );
    bindUpgradeIntentToOrganization(41);
    expect(readUpgradeIntent(now)?.subject).toEqual({ kind: "organization", organizationId: 42 });
  });

  it("adds a small success marker without losing query or hash", () => {
    expect(addUpgradeSuccessMarker("/booking/book_123/logs?from=bookings#history")).toBe(
      "/booking/book_123/logs?from=bookings&upgrade=complete#history"
    );
  });
});
