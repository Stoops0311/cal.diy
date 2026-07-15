import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it, vi } from "vitest";
import {
  archiveOrganizationHandler,
  changeOrganizationRoleHandler,
  createOrganizationHandler,
  getOrganizationHandler,
  inviteOrganizationMemberHandler,
  type OrganizationHandlerDependencies,
  removeOrganizationMemberHandler,
} from "./organizations.handler";

function setup() {
  const commands = {
    archiveOrganization: vi.fn(),
    changeMemberRole: vi.fn(),
    createOrganization: vi.fn(),
    inviteMember: vi.fn(),
    removeMember: vi.fn(),
  };
  const read = {
    getForMember: vi.fn().mockResolvedValue({ archivedAt: null, id: 41, members: [], name: "Acme" }),
  };
  const dependencies: OrganizationHandlerDependencies = { commands, read };
  return { commands, dependencies, read };
}

const ctx = { user: { id: 7 } };

describe("organization handlers", () => {
  it("uses only the authenticated local user when creating", async () => {
    const test = setup();

    await createOrganizationHandler({
      ctx,
      dependencies: test.dependencies,
      input: { name: "Acme", slug: "acme" },
    });

    expect(test.commands.createOrganization).toHaveBeenCalledWith({
      actorUserId: 7,
      name: "Acme",
      slug: "acme",
    });
  });

  it("maps API roles to Clerk roles for invites and changes", async () => {
    const test = setup();

    await inviteOrganizationMemberHandler({
      ctx,
      dependencies: test.dependencies,
      input: { email: "new@example.com", organizationId: 41, role: "ADMIN" },
    });
    await changeOrganizationRoleHandler({
      ctx,
      dependencies: test.dependencies,
      input: { memberUserId: 9, organizationId: 41, role: "MEMBER" },
    });

    expect(test.commands.inviteMember).toHaveBeenCalledWith({
      actorUserId: 7,
      email: "new@example.com",
      organizationId: 41,
      role: "org:admin",
    });
    expect(test.commands.changeMemberRole).toHaveBeenCalledWith({
      actorUserId: 7,
      memberUserId: 9,
      organizationId: 41,
      role: "org:member",
    });
  });

  it("passes the authenticated actor to remove and archive", async () => {
    const test = setup();

    await removeOrganizationMemberHandler({
      ctx,
      dependencies: test.dependencies,
      input: { memberUserId: 9, organizationId: 41 },
    });
    await archiveOrganizationHandler({
      ctx,
      dependencies: test.dependencies,
      input: { organizationId: 41 },
    });

    expect(test.commands.removeMember).toHaveBeenCalledWith({
      actorUserId: 7,
      memberUserId: 9,
      organizationId: 41,
    });
    expect(test.commands.archiveOrganization).toHaveBeenCalledWith({ actorUserId: 7, organizationId: 41 });
  });

  it("returns archived organizations to existing members as read-only data", async () => {
    const test = setup();
    const archivedAt = new Date("2026-07-15T12:00:00.000Z");
    test.read.getForMember.mockResolvedValue({ archivedAt, id: 41, members: [], name: "Archived" });

    await expect(
      getOrganizationHandler({ ctx, dependencies: test.dependencies, input: { organizationId: 41 } })
    ).resolves.toMatchObject({ archivedAt, id: 41 });
    expect(test.read.getForMember).toHaveBeenCalledWith({ organizationId: 41, userId: 7 });
  });

  it("denies an organization ID not visible to the local member", async () => {
    const test = setup();
    test.read.getForMember.mockResolvedValue(null);

    await expect(
      getOrganizationHandler({ ctx, dependencies: test.dependencies, input: { organizationId: 999 } })
    ).rejects.toEqual(new ErrorWithCode(ErrorCode.NotFound, "Organization not found"));
  });
});
