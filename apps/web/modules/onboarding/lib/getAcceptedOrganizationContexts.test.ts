import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: { membership: { findMany: mocks.findMany } },
}));

import { getAcceptedOrganizationContexts } from "./getAcceptedOrganizationContexts";

describe("getAcceptedOrganizationContexts", () => {
  beforeEach(() => mocks.findMany.mockReset());

  it("queries only accepted, unarchived organizations with a narrow select", async () => {
    mocks.findMany.mockResolvedValue([]);

    await getAcceptedOrganizationContexts({ userId: 7 });

    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: { teamId: "asc" },
      select: {
        role: true,
        team: { select: { id: true, name: true, slug: true } },
      },
      where: {
        accepted: true,
        team: { archivedAt: null, isOrganization: true },
        userId: 7,
      },
    });
  });

  it("puts the active session organization first without returning provider identifiers", async () => {
    mocks.findMany.mockResolvedValue([
      { role: "MEMBER", team: { id: 20, name: "Field", slug: "field" } },
      { role: "OWNER", team: { id: 41, name: "Operations", slug: "operations" } },
    ]);

    await expect(
      getAcceptedOrganizationContexts({ preferredOrganizationId: 41, userId: 7 })
    ).resolves.toEqual([
      { id: 41, name: "Operations", role: "OWNER", slug: "operations" },
      { id: 20, name: "Field", role: "MEMBER", slug: "field" },
    ]);
  });
});
