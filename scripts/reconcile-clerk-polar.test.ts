import { describe, expect, it, vi } from "vitest";
import {
  applyReconciliation,
  detectReconciliationDrift,
  parseReconciliationArguments,
  type ReconciliationAdapter,
  type ReconciliationSnapshot,
} from "./reconcile-clerk-polar";

const subjectKey = "organization:42";

function snapshot(overrides: Partial<ReconciliationSnapshot> = {}): ReconciliationSnapshot {
  return {
    billing: {
      acceptedSeats: 2,
      entitlementPlan: "TEAM",
      local: {
        customerId: "customer_fixture",
        effectiveAt: new Date("2026-07-15T12:00:00Z"),
        plan: "TEAM",
        productId: "product_team",
        seats: 2,
        status: "TRIALING",
        subscriptionId: "subscription_fixture",
      },
      provider: {
        customerId: "customer_fixture",
        effectiveAt: new Date("2026-07-15T12:00:00Z"),
        plan: "TEAM",
        productId: "product_team",
        seats: 2,
        status: "TRIALING",
        subscriptionId: "subscription_fixture",
      },
      webhookDeliveryExists: true,
    },
    identity: null,
    organization: {
      clerkOrganizationId: "org_fixture",
      localOrganizationId: 42,
      localMemberships: [
        { accepted: true, clerkUserId: "user_owner", role: "OWNER" },
        { accepted: true, clerkUserId: "user_member", role: "MEMBER" },
      ],
      providerExists: true,
      providerMemberships: [
        { clerkUserId: "user_owner", role: "OWNER" },
        { clerkUserId: "user_member", role: "MEMBER" },
      ],
    },
    subjectKey,
    ...overrides,
  };
}

describe("Clerk and Polar reconciliation", () => {
  it("parses one mode and at most one exact scope", () => {
    expect(parseReconciliationArguments(["--dry-run"])).toEqual({ mode: "dry-run" });
    expect(parseReconciliationArguments(["--apply", "--user-id=7"])).toEqual({
      mode: "apply",
      userId: 7,
    });
    expect(() => parseReconciliationArguments([])).toThrow("exactly one mode");
    expect(() => parseReconciliationArguments(["--apply", "--user-id=7", "--organization-id=8"])).toThrow(
      "one subject scope"
    );
    expect(() => parseReconciliationArguments(["--apply"])).toThrow("exact subject scope");
  });

  it("detects an unambiguous missing Clerk mapping", () => {
    const result = detectReconciliationDrift(
      snapshot({
        identity: {
          candidateProviderIds: ["user_fixture"],
          exactCandidateId: "user_fixture",
          localUserId: 7,
          mappedProviderId: null,
          providerExists: true,
        },
        organization: null,
        subjectKey: "user:7",
      })
    );

    expect(result).toContainEqual({ code: "MISSING_CLERK_MAPPING", repairable: true, subjectKey: "user:7" });
  });

  it("detects missing local organization, role drift, and stale accepted membership", () => {
    expect(
      detectReconciliationDrift(
        snapshot({
          organization: {
            clerkOrganizationId: "org_fixture",
            localOrganizationId: null,
            localMemberships: [],
            providerExists: true,
            providerMemberships: [],
          },
        })
      )
    ).toContainEqual({ code: "MISSING_LOCAL_ORGANIZATION", repairable: true, subjectKey });

    const drifted = snapshot();
    if (!drifted.organization) throw new Error("organization fixture missing");
    drifted.organization.localMemberships[1] = {
      accepted: true,
      clerkUserId: "user_member",
      role: "ADMIN",
    };
    drifted.organization.localMemberships.push({
      accepted: true,
      clerkUserId: "user_stale",
      role: "MEMBER",
    });
    expect(detectReconciliationDrift(drifted).map(({ code }) => code)).toEqual([
      "MEMBERSHIP_ROLE_DRIFT",
      "STALE_ACCEPTED_MEMBERSHIP",
    ]);
  });

  it("detects Polar seat, projection, entitlement, and delivery drift", () => {
    const drifted = snapshot();
    if (!drifted.billing?.provider || !drifted.billing.local) throw new Error("billing fixture missing");
    drifted.billing.provider.seats = 3;
    drifted.billing.provider.status = "ACTIVE";
    drifted.billing.provider.effectiveAt = new Date("2026-07-15T13:00:00Z");
    drifted.billing.entitlementPlan = "PRO";
    drifted.billing.webhookDeliveryExists = false;

    expect(detectReconciliationDrift(drifted).map(({ code }) => code)).toEqual([
      "POLAR_SEAT_DRIFT",
      "STALE_PROJECTION",
      "ENTITLEMENT_DRIFT",
      "MISSING_WEBHOOK_DELIVERY",
    ]);
  });

  it("reports an unknown provider object without proposing a destructive repair", () => {
    const drifted = snapshot();
    if (!drifted.billing) throw new Error("billing fixture missing");
    drifted.billing.provider = null;

    expect(detectReconciliationDrift(drifted)).toContainEqual({
      code: "UNKNOWN_PROVIDER_OBJECT",
      repairable: false,
      subjectKey,
    });
  });

  it("applies repairable drift and a rerun becomes a no-op", async () => {
    let current = snapshot();
    if (!current.billing?.provider) throw new Error("billing fixture missing");
    current.billing.provider.seats = 3;
    const repair = vi.fn(async () => {
      current = snapshot();
    });
    const adapter: ReconciliationAdapter = {
      read: vi.fn(async () => current),
      repair,
    };

    await expect(applyReconciliation(adapter, subjectKey)).resolves.toEqual([]);
    expect(repair).toHaveBeenCalledWith("POLAR_SEAT_DRIFT", subjectKey);
    await expect(applyReconciliation(adapter, subjectKey)).resolves.toEqual([]);
    expect(repair).toHaveBeenCalledTimes(1);
  });
});
