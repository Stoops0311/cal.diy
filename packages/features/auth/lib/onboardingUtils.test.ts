import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkIfFeatureIsEnabledGlobally: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: class {
    checkIfFeatureIsEnabledGlobally = mocks.checkIfFeatureIsEnabledGlobally;
  },
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    findById = mocks.findById;
  },
}));

vi.mock("@calcom/prisma", () => ({ prisma: {} }));

import { checkOnboardingRedirect } from "./onboardingUtils";

describe("checkOnboardingRedirect", () => {
  beforeEach(() => {
    mocks.checkIfFeatureIsEnabledGlobally.mockReset();
    mocks.findById.mockReset();
    mocks.findById.mockResolvedValue({
      completedOnboarding: false,
      createdDate: new Date("2026-01-01"),
      emailVerified: new Date(),
      identityProvider: "CAL",
    });
    mocks.checkIfFeatureIsEnabledGlobally.mockImplementation((feature: string) =>
      Promise.resolve(feature === "onboarding-v3")
    );
  });

  it("routes an incomplete v3 user through setup even with an active organization", async () => {
    await expect(checkOnboardingRedirect(7, { organizationId: 41 })).resolves.toBe(
      "/onboarding/getting-started"
    );
  });

  it("keeps email verification ahead of onboarding", async () => {
    mocks.findById.mockResolvedValue({
      completedOnboarding: false,
      createdDate: new Date("2026-01-01"),
      emailVerified: null,
      identityProvider: "CAL",
    });
    mocks.checkIfFeatureIsEnabledGlobally.mockResolvedValue(true);

    await expect(
      checkOnboardingRedirect(7, { checkEmailVerification: true, organizationId: 41 })
    ).resolves.toBe("/auth/verify-email");
  });

  it("does not reopen onboarding after completion", async () => {
    mocks.findById.mockResolvedValue({
      completedOnboarding: true,
      createdDate: new Date("2026-01-01"),
      emailVerified: new Date(),
      identityProvider: "CAL",
    });

    await expect(checkOnboardingRedirect(7, { organizationId: 41 })).resolves.toBeNull();
  });
});
