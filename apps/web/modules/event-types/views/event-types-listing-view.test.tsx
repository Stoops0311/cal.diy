import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/web/modules/event-types/components/CreateEventTypeDialog", () => ({
  CreateEventTypeDialog: () => null,
}));

import {
  getBillingOrganizationIdForProfile,
  getEventTypeListingUpgradeContext,
  handleSetHiddenMutationError,
} from "./event-types-listing-view";

describe("event type unhide entitlement failures", () => {
  const restore = vi.fn();
  const openFromError = vi.fn();
  const logError = vi.fn();

  beforeEach(() => {
    restore.mockReset();
    openFromError.mockReset();
    logError.mockReset();
  });

  it.each([
    { kind: "limit", resource: "activePersonalEventTypes" },
    { capability: "canCreateTeamEvents", kind: "capability" },
  ])("restores the optimistic state and opens a prompt for $kind", (entitlement) => {
    openFromError.mockReturnValue(true);
    const error = { data: { entitlement }, message: "Forbidden" };
    const context = {
      organizationId: 41,
      returnTo: "/event-types?teamId=7&view=list",
      teamId: 7,
    };

    handleSetHiddenMutationError({ context, error, logError, openFromError, restore });

    expect(restore).toHaveBeenCalledOnce();
    expect(openFromError).toHaveBeenCalledWith(error, context);
    expect(logError).not.toHaveBeenCalled();
  });

  it("restores state and retains ordinary forbidden handling", () => {
    openFromError.mockReturnValue(false);
    const error = { data: { code: "FORBIDDEN" }, message: "Forbidden" };

    handleSetHiddenMutationError({
      context: { returnTo: "/event-types" },
      error,
      logError,
      openFromError,
      restore,
    });

    expect(restore).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith("Forbidden");
  });

  it("derives organization scope only from the authoritative parent organization", () => {
    expect(
      getEventTypeListingUpgradeContext({ parentId: 41, teamId: 7 }, "/event-types", "teamId=7")
    ).toEqual({
      organizationId: 41,
      returnTo: "/event-types?teamId=7",
      teamId: 7,
    });
    expect(
      getEventTypeListingUpgradeContext({ parentId: null, teamId: 7 }, "/event-types", "teamId=7")
    ).toEqual({
      returnTo: "/event-types?teamId=7",
      teamId: 7,
    });
    expect(
      getEventTypeListingUpgradeContext({ parentId: null, teamId: 41 }, "/event-types", "teamId=41", 41)
    ).toEqual({
      organizationId: 41,
      returnTo: "/event-types?teamId=41",
      teamId: 41,
    });
    expect(
      getEventTypeListingUpgradeContext({ parentId: null, teamId: 7 }, "/event-types", "teamId=7", 41)
    ).toEqual({
      returnTo: "/event-types?teamId=7",
      teamId: 7,
    });
  });

  it("matches a profile to its own group before selecting the billing organization", () => {
    const groups = [
      { parentId: 41, teamId: 7 },
      { parentId: 88, teamId: 9 },
    ];

    expect(getBillingOrganizationIdForProfile(7, groups)).toBe(41);
    expect(getBillingOrganizationIdForProfile(9, groups)).toBe(88);
    expect(getBillingOrganizationIdForProfile(8, groups)).toBeUndefined();
    expect(getBillingOrganizationIdForProfile(null, groups)).toBeUndefined();
    expect(getBillingOrganizationIdForProfile(41, [{ parentId: null, teamId: 41 }], 41)).toBe(41);
    expect(getBillingOrganizationIdForProfile(41, [{ parentId: null, teamId: 41 }])).toBeUndefined();
  });
});
