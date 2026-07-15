import { describe, expect, it } from "vitest";
import { migrateOnboardingState } from "./onboarding-store";

describe("migrateOnboardingState", () => {
  it("adds intent fields without inferring them from the legacy selected plan", () => {
    const migrated = migrateOnboardingState(
      {
        selectedPlan: "team",
        personalDetails: { avatar: null, bio: "", name: "Ada", timezone: "UTC", username: "ada" },
      },
      1
    );

    expect(migrated).toMatchObject({
      createdOrganization: null,
      intent: null,
      selectedPlan: "team",
    });
  });

  it("keeps a version-two intent and created organization", () => {
    const persisted = {
      createdOrganization: { id: 41, name: "Operations", slug: "operations" },
      intent: "bring-team" as const,
      selectedPlan: "personal" as const,
    };

    expect(migrateOnboardingState(persisted, 2)).toEqual(persisted);
  });

  it("retains the legacy oversized-image cleanup", () => {
    const oversizedLogo = "x".repeat(500_001);
    const migrated = migrateOnboardingState(
      {
        organizationBrand: { banner: null, color: "#000000", logo: oversizedLogo },
        personalDetails: { avatar: oversizedLogo, bio: "", name: "Ada", timezone: "UTC", username: "ada" },
        selectedPlan: "personal",
        teamBrand: { color: "#000000", logo: oversizedLogo },
      },
      0
    );

    expect(migrated.organizationBrand?.logo).toBeNull();
    expect(migrated.teamBrand?.logo).toBeNull();
    expect(migrated.personalDetails?.avatar).toBeNull();
  });
});
