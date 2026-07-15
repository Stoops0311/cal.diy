import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey } from "@calcom/features/billing/lib/plans";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldHideBrandingForEvent,
  shouldHideBrandingForEventUsingProfile,
  shouldHideBrandingForTeamEvent,
  shouldHideBrandingForUserEvent,
} from "./hideBranding";

// Mock the dependencies
vi.mock("@calcom/features/users/repositories/UserRepository", () => {
  return {
    UserRepository: class MockUserRepository {
      findUserWithHideBranding = vi.fn();
    },
  };
});

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findByUserIdAndOrgSlug: vi.fn(),
  },
}));

vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      error: vi.fn(),
    }),
  },
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

describe("hideBranding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verified entitlement override", () => {
    it("forces branding on for a Free user even when the stored preference hides it", async () => {
      const result = await shouldHideBrandingForEvent({
        entitlements: { forOrganization: vi.fn(), forUser: vi.fn().mockResolvedValue(getEntitlements(null)) },
        eventTypeId: 1,
        organizationId: null,
        owner: { hideBranding: true, id: 7 },
        team: null,
      });

      expect(result).toBe(false);
    });

    it("honors the stored preference for an active Pro user", async () => {
      const pro = getEntitlements({
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
        plan: PlanKey.PRO,
        status: BillingStatus.ACTIVE,
      });
      const result = await shouldHideBrandingForEvent({
        entitlements: { forOrganization: vi.fn(), forUser: vi.fn().mockResolvedValue(pro) },
        eventTypeId: 1,
        organizationId: null,
        owner: { hideBranding: true, id: 7 },
        team: null,
      });

      expect(result).toBe(true);
    });
  });

  describe("shouldHideBrandingForEventUsingProfile", () => {
    describe("team events", () => {
      it("should return true when team has hideBranding enabled", () => {
        const team = {
          hideBranding: true,
          parent: null,
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner: null,
          team,
        });

        expect(result).toBe(true);
      });

      it("should return true when parent organization has hideBranding enabled", () => {
        const team = {
          hideBranding: false,
          parent: {
            hideBranding: true,
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner: null,
          team,
        });

        expect(result).toBe(true);
      });

      it("should return true when both team and parent have hideBranding enabled", () => {
        const team = {
          hideBranding: true,
          parent: {
            hideBranding: true,
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner: null,
          team,
        });

        expect(result).toBe(true);
      });

      it("should return false when neither team nor parent has hideBranding enabled", () => {
        const team = {
          hideBranding: false,
          parent: {
            hideBranding: false,
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner: null,
          team,
        });

        expect(result).toBe(false);
      });

      it("should return false when team has hideBranding disabled and no parent", () => {
        const team = {
          hideBranding: false,
          parent: null,
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner: null,
          team,
        });

        expect(result).toBe(false);
      });

      it("should handle null hideBranding values", () => {
        const team = {
          hideBranding: null,
          parent: {
            hideBranding: null,
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner: null,
          team,
        });

        expect(result).toBe(false);
      });
    });

    describe("user events", () => {
      it("should return true when user has hideBranding enabled", () => {
        const owner = {
          id: 1,
          hideBranding: true,
          profile: null,
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner,
          team: null,
        });

        expect(result).toBe(true);
      });

      it("should return true when user's organization has hideBranding enabled", () => {
        const owner = {
          id: 1,
          hideBranding: false,
          profile: {
            organization: {
              hideBranding: true,
            },
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner,
          team: null,
        });

        expect(result).toBe(true);
      });

      it("should return true when both user and organization have hideBranding enabled", () => {
        const owner = {
          id: 1,
          hideBranding: true,
          profile: {
            organization: {
              hideBranding: true,
            },
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner,
          team: null,
        });

        expect(result).toBe(true);
      });

      it("should return false when neither user nor organization has hideBranding enabled", () => {
        const owner = {
          id: 1,
          hideBranding: false,
          profile: {
            organization: {
              hideBranding: false,
            },
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner,
          team: null,
        });

        expect(result).toBe(false);
      });

      it("should return false when user has hideBranding disabled and no organization", () => {
        const owner = {
          id: 1,
          hideBranding: false,
          profile: {
            organization: null,
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner,
          team: null,
        });

        expect(result).toBe(false);
      });

      it("should handle null profile", () => {
        const owner = {
          id: 1,
          hideBranding: false,
          profile: null,
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner,
          team: null,
        });

        expect(result).toBe(false);
      });

      it("should handle null hideBranding values", () => {
        const owner = {
          id: 1,
          hideBranding: null,
          profile: {
            organization: {
              hideBranding: null,
            },
          },
        };

        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner,
          team: null,
        });

        expect(result).toBe(false);
      });
    });

    describe("no owner or team", () => {
      it("should return false when neither owner nor team is provided", () => {
        const result = shouldHideBrandingForEventUsingProfile({
          eventTypeId: 1,
          owner: null,
          team: null,
        });

        expect(result).toBe(false);
      });
    });
  });

  describe("shouldHideBrandingForTeamEvent", () => {
    it("should return true when team has hideBranding enabled", () => {
      const team = {
        hideBranding: true,
        parent: null,
      };

      const result = shouldHideBrandingForTeamEvent({
        eventTypeId: 1,
        team,
      });

      expect(result).toBe(true);
    });

    it("should return true when parent organization has hideBranding enabled", () => {
      const team = {
        hideBranding: false,
        parent: {
          hideBranding: true,
        },
      };

      const result = shouldHideBrandingForTeamEvent({
        eventTypeId: 1,
        team,
      });

      expect(result).toBe(true);
    });

    it("should return false when neither team nor parent has hideBranding enabled", () => {
      const team = {
        hideBranding: false,
        parent: {
          hideBranding: false,
        },
      };

      const result = shouldHideBrandingForTeamEvent({
        eventTypeId: 1,
        team,
      });

      expect(result).toBe(false);
    });
  });

  describe("shouldHideBrandingForUserEvent", () => {
    it("should return true when user has hideBranding enabled", () => {
      const owner = {
        id: 1,
        hideBranding: true,
        profile: null,
      };

      const result = shouldHideBrandingForUserEvent({
        eventTypeId: 1,
        owner,
      });

      expect(result).toBe(true);
    });

    it("should return true when user's organization has hideBranding enabled", () => {
      const owner = {
        id: 1,
        hideBranding: false,
        profile: {
          organization: {
            hideBranding: true,
          },
        },
      };

      const result = shouldHideBrandingForUserEvent({
        eventTypeId: 1,
        owner,
      });

      expect(result).toBe(true);
    });

    it("should return false when neither user nor organization has hideBranding enabled", () => {
      const owner = {
        id: 1,
        hideBranding: false,
        profile: {
          organization: {
            hideBranding: false,
          },
        },
      };

      const result = shouldHideBrandingForUserEvent({
        eventTypeId: 1,
        owner,
      });

      expect(result).toBe(false);
    });
  });
});
