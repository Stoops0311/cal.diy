import { describe, expect, it, vi } from "vitest";
import {
  cleanupTaggedFixtures,
  createE2ERunTag,
  createEmailAlias,
  type FixtureCleanupAdapter,
  type FixtureManifest,
  isRecoverableInterruptedSignup,
  isRecoverableUnprovisionedSignup,
} from "./fixtures";

const runTag = "convenio-e2e-20260715T120000Z-ab12cd";

function manifest(objects: FixtureManifest["objects"]): FixtureManifest {
  return { createdAt: "2026-07-15T12:00:00.000Z", objects, runTag };
}

function adapter(metadata = { convenioE2ERunTag: runTag }): FixtureCleanupAdapter {
  return {
    load: vi.fn().mockResolvedValue({ metadata }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Clerk and Polar E2E fixture ownership", () => {
  it("creates a deliverable plus-address alias for each fixture", () => {
    expect(createEmailAlias("qa+old@example.test", "convenio_clerk_test_ab12cd")).toBe(
      "qa+convenio_clerk_test_ab12cd@example.test"
    );
  });

  it("creates a stable UTC run tag", () => {
    expect(createE2ERunTag(new Date("2026-07-15T12:34:56.789Z"), () => "ABC_123")).toBe(
      "convenio-e2e-20260715T123456Z-abc123"
    );
  });

  it.each([
    "clerk_user",
    "clerk_organization",
    "clerk_membership",
    "polar_customer",
    "polar_subscription",
    "local_user",
    "local_organization",
    "local_projection",
  ] as const)("refuses to delete an untagged %s", async (kind) => {
    const unsafe = adapter({});

    await expect(cleanupTaggedFixtures(manifest([{ id: "owned-id", kind }]), unsafe)).rejects.toMatchObject({
      code: "E2E_TAG_MISMATCH",
    });
    expect(unsafe.remove).not.toHaveBeenCalled();
  });

  it("removes local projections before the tagged Clerk identities that prove their ownership", async () => {
    const safe = adapter();
    const input = manifest([
      { id: "user", kind: "clerk_user" },
      { id: "org", kind: "clerk_organization" },
      { id: "membership", kind: "clerk_membership", parentId: "org" },
      { id: "customer", kind: "polar_customer" },
      { id: "subscription", kind: "polar_subscription" },
      { id: "local-user", kind: "local_user" },
      { id: "local-org", kind: "local_organization" },
      { id: "projection", kind: "local_projection" },
    ]);

    await cleanupTaggedFixtures(input, safe);

    expect(vi.mocked(safe.remove).mock.calls.map(([record]) => record.kind)).toEqual([
      "polar_subscription",
      "polar_customer",
      "clerk_membership",
      "local_projection",
      "local_organization",
      "local_user",
      "clerk_organization",
      "clerk_user",
    ]);
  });

  it("tolerates partial setup and repeated cleanup", async () => {
    const safe: FixtureCleanupAdapter = {
      load: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ metadata: { convenioE2ERunTag: runTag } }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const input = manifest([
      { id: "already-gone", kind: "polar_subscription" },
      { id: "still-present", kind: "polar_customer" },
    ]);

    await expect(cleanupTaggedFixtures(input, safe)).resolves.toEqual({ removed: 1, skipped: 1 });
  });

  it("recovers only the exact interrupted signup mapping owned by the run", () => {
    const candidate = {
      clerkMetadata: {},
      clerkExternalId: "42",
      clerkUserId: "user_fixture",
      email: "qa+convenio_clerk_test_ab12cd@example.test",
      localMetadata: null,
      localUserId: 42,
      mappedClerkUserId: "user_fixture",
    };

    expect(isRecoverableInterruptedSignup(candidate, runTag)).toBe(true);
    expect(isRecoverableInterruptedSignup({ ...candidate, email: "someone@example.com" }, runTag)).toBe(
      false
    );
    expect(
      isRecoverableInterruptedSignup({ ...candidate, mappedClerkUserId: "user_different" }, runTag)
    ).toBe(false);
    expect(isRecoverableInterruptedSignup({ ...candidate, clerkExternalId: "43" }, runTag)).toBe(false);
    expect(
      isRecoverableInterruptedSignup(
        { ...candidate, clerkMetadata: { convenioE2ERunTag: "another-run" } },
        runTag
      )
    ).toBe(false);
    expect(
      isRecoverableInterruptedSignup(
        { ...candidate, localMetadata: { convenioE2ERunTag: "another-run" } },
        runTag
      )
    ).toBe(false);
  });

  it("recovers only an exact unprovisioned signup created during the run", () => {
    const runStartedAt = Date.parse("2026-07-15T12:00:00.000Z");
    const candidate = {
      clerkExternalId: null,
      clerkMetadata: {},
      createdAt: runStartedAt + 1_000,
      email: "qa+convenio_clerk_test_ab12cd@example.test",
    };

    expect(isRecoverableUnprovisionedSignup(candidate, runTag, runStartedAt, runStartedAt + 2_000)).toBe(
      true
    );
    expect(
      isRecoverableUnprovisionedSignup(
        { ...candidate, email: "someone@example.com" },
        runTag,
        runStartedAt,
        runStartedAt + 2_000
      )
    ).toBe(false);
    expect(
      isRecoverableUnprovisionedSignup(
        { ...candidate, clerkExternalId: "42" },
        runTag,
        runStartedAt,
        runStartedAt + 2_000
      )
    ).toBe(false);
    expect(
      isRecoverableUnprovisionedSignup(
        { ...candidate, clerkMetadata: { convenioE2ERunTag: "another-run" } },
        runTag,
        runStartedAt,
        runStartedAt + 2_000
      )
    ).toBe(false);
    expect(
      isRecoverableUnprovisionedSignup(
        { ...candidate, createdAt: runStartedAt - 10_000 },
        runTag,
        runStartedAt,
        runStartedAt + 2_000
      )
    ).toBe(false);
  });
});
