import { describe, expect, it } from "vitest";
import { getOrganizationMembersTab } from "./organizationMembersTab";

describe("getOrganizationMembersTab", () => {
  it("returns the same-origin members entry for organization 41", () => {
    expect(getOrganizationMembersTab(41)).toEqual({
      name: "members",
      href: "/settings/organizations/members?organizationId=41",
      trackingMetadata: { section: "organization", page: "members" },
    });
    expect(getOrganizationMembersTab(41)).not.toHaveProperty("isExternalLink");
  });

  it.each([undefined, null, 0, -1, 1.5])("returns no entry for invalid organization ID %s", (id) => {
    expect(getOrganizationMembersTab(id)).toBeNull();
  });
});
