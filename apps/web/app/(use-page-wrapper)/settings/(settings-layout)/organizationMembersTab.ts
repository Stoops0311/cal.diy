type OrganizationMembersTab = {
  name: "members";
  href: string;
  trackingMetadata: { section: "organization"; page: "members" };
};

function getOrganizationMembersTab(organizationId: number | null | undefined): OrganizationMembersTab | null {
  if (!Number.isInteger(organizationId) || !organizationId || organizationId < 1) return null;

  return {
    name: "members",
    href: `/settings/organizations/members?organizationId=${organizationId}`,
    trackingMetadata: { section: "organization", page: "members" },
  };
}

export { getOrganizationMembersTab };
