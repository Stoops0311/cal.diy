import { describe, expect, it, vi } from "vitest";
import {
  assertBillingProjection,
  assertOneLocalUser,
  type DatabaseAssertionClient,
} from "./databaseAssertions";

function database(overrides: Partial<DatabaseAssertionClient> = {}): DatabaseAssertionClient {
  return {
    billingSubscription: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    ...overrides,
  };
}

describe("Clerk and Polar database assertions", () => {
  it("requires exactly one mapped local user", async () => {
    const duplicated = database({
      user: { findMany: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
    });

    await expect(assertOneLocalUser("person@example.com", undefined, duplicated)).rejects.toThrow(
      "Expected exactly one local user"
    );
  });

  it("rejects the wrong Clerk mapping", async () => {
    const mismatched = database({
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ clerkUserId: "user_other", email: "person@example.com", id: 1 }]),
      },
    });

    await expect(assertOneLocalUser("person@example.com", "user_expected", mismatched)).rejects.toThrow(
      "Clerk user mapping mismatch"
    );
  });

  it("asserts the exact billing projection", async () => {
    const correct = database({
      billingSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          cancelAtPeriodEnd: false,
          interval: "MONTH",
          plan: "PRO",
          polarCustomerId: "customer-1",
          polarSubscriptionId: "subscription-1",
          seatCount: 1,
          status: "ACTIVE",
        }),
      },
    });

    await expect(
      assertBillingProjection(
        "user:user_1",
        { cancelAtPeriodEnd: false, interval: "MONTH", plan: "PRO", seatCount: 1, status: "ACTIVE" },
        correct
      )
    ).resolves.toMatchObject({ polarCustomerId: "customer-1", polarSubscriptionId: "subscription-1" });
  });
});
