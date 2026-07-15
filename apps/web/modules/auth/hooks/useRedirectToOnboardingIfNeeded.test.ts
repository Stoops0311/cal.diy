import { describe, expect, it } from "vitest";
import { shouldShowOnboarding } from "./useRedirectToOnboardingIfNeeded";

describe("shouldShowOnboarding", () => {
  it("does not skip an incomplete user because an organization profile is active", () => {
    expect(shouldShowOnboarding({ completedOnboarding: false, createdDate: new Date("2026-01-01") })).toBe(
      true
    );
  });

  it("does not reopen onboarding after completion", () => {
    expect(shouldShowOnboarding({ completedOnboarding: true, createdDate: new Date("2026-01-01") })).toBe(
      false
    );
  });
});
