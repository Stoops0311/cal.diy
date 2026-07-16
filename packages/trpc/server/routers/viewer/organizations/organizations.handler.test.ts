import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import { BillingStatus, PlanKey } from "@calcom/features/billing/lib/plans";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it, vi } from "vitest";
import {
  archiveOrganizationHandler,
  changeOrganizationRoleHandler,
  createOrganizationHandler,
  getOrganizationHandler,
  inviteOrganizationMemberHandler,
  membersOrganizationHandler,
  type OrganizationHandlerDependencies,
  removeOrganizationMemberHandler,
  resendOrganizationInvitationHandler,
  revokeOrganizationInvitationHandler,
} from "./organizations.handler";
import { ZOrganizationInvitationSchema } from "./organizations.schema";

function organizationFor(actorRole: "OWNER" | "ADMIN" | "MEMBER" = "OWNER") {
  return {
    archivedAt: null,
    clerkOrganizationId: "org_provider_only",
    credential: "never-return",
    id: 41,
    members: [
      {
        accepted: true,
        role: actorRole,
        user: { avatarUrl: "https://img.test/ada.png", email: "ada@example.com", id: 7, name: "Ada" },
      },
      {
        accepted: true,
        role: "ADMIN" as const,
        user: { avatarUrl: null, email: "admin@example.com", id: 8, name: "Admin" },
      },
      {
        accepted: true,
        role: "MEMBER" as const,
        user: { avatarUrl: null, email: "member@example.com", id: 9, name: null },
      },
      {
        accepted: true,
        role: "MEMBER" as const,
        user: { avatarUrl: null, email: "member-2@example.com", id: 10, name: "Member" },
      },
    ],
    name: "Acme",
    providerMetadata: { private: true },
    slug: "acme",
    url: "https://provider.test/organizations/41",
  };
}

function teamEntitlements(acceptedOrganizationMembers = 4) {
  return {
    ...getEntitlements({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-16T12:00:00.000Z"),
      plan: PlanKey.TEAM,
      status: BillingStatus.ACTIVE,
    }),
    usage: { acceptedOrganizationMembers, activePersonalEventTypes: 0, connectedCalendars: 0 },
  };
}

function forbiddenOutputKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(forbiddenOutputKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const own = key !== "avatarUrl" && /clerk|provider|credential|url/i.test(key) ? [key] : [];
    return [...own, ...forbiddenOutputKeys(nested)];
  });
}

function setup() {
  const commands = {
    archiveOrganization: vi.fn(),
    changeMemberRole: vi.fn(),
    createOrganization: vi.fn(),
    inviteMember: vi.fn(),
    listPendingInvitations: vi.fn().mockResolvedValue([
      {
        createdAt: new Date("2026-07-16T12:00:00.000Z"),
        email: "pending@example.com",
        id: "inv_1",
        providerMetadata: { private: true },
        role: "org:member" as const,
        url: "https://provider.test/invitations/inv_1",
      },
    ]),
    removeMember: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  };
  const read = {
    getForMember: vi.fn().mockResolvedValue(organizationFor()),
  };
  const entitlements = { forOrganization: vi.fn().mockResolvedValue(teamEntitlements()) };
  const dependencies: OrganizationHandlerDependencies = { commands, entitlements, read };
  return { commands, dependencies, entitlements, read };
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

  it.each([
    "OWNER",
    "ADMIN",
  ] as const)("returns safe members and pending invitations to an %s", async (role) => {
    const test = setup();
    test.read.getForMember.mockResolvedValue(organizationFor(role));

    const result = await membersOrganizationHandler({
      ctx,
      dependencies: test.dependencies,
      input: { organizationId: 41 },
    });

    expect(result).toMatchObject({
      acceptedSeats: 4,
      actorRole: role,
      canManageInvitations: true,
      id: 41,
      name: "Acme",
      pendingInvitations: [{ email: "pending@example.com", id: "inv_1", role: "MEMBER" }],
      seatLimit: 50,
      slug: "acme",
    });
    expect(result.members[0]).toEqual({
      avatarUrl: "https://img.test/ada.png",
      email: "ada@example.com",
      id: 7,
      name: "Ada",
      role,
    });
    expect(test.commands.listPendingInvitations).toHaveBeenCalledWith({
      actorUserId: 7,
      organizationId: 41,
    });
    expect(test.entitlements.forOrganization).toHaveBeenCalledWith(41);
  });

  it("shows accepted seats to an ordinary member without a pending provider call or controls", async () => {
    const test = setup();
    test.read.getForMember.mockResolvedValue(organizationFor("MEMBER"));

    const result = await membersOrganizationHandler({
      ctx,
      dependencies: test.dependencies,
      input: { organizationId: 41 },
    });

    expect(result).toMatchObject({
      acceptedSeats: 4,
      actorRole: "MEMBER",
      canManageInvitations: false,
      pendingInvitations: [],
      seatLimit: 50,
    });
    expect(test.commands.listPendingInvitations).not.toHaveBeenCalled();
  });

  it("denies the members view when accepted membership is missing", async () => {
    const test = setup();
    test.read.getForMember.mockResolvedValue(null);

    await expect(
      membersOrganizationHandler({ ctx, dependencies: test.dependencies, input: { organizationId: 999 } })
    ).rejects.toEqual(new ErrorWithCode(ErrorCode.NotFound, "Organization not found"));
    expect(test.commands.listPendingInvitations).not.toHaveBeenCalled();
  });

  it("uses configured Team capacity even when the organization is provisional", async () => {
    const test = setup();
    test.entitlements.forOrganization.mockResolvedValue({
      ...getEntitlements(null),
      usage: { acceptedOrganizationMembers: 1, activePersonalEventTypes: 0, connectedCalendars: 0 },
    });

    await expect(
      membersOrganizationHandler({ ctx, dependencies: test.dependencies, input: { organizationId: 41 } })
    ).resolves.toMatchObject({ canManageInvitations: false, seatLimit: 50 });
    expect(test.commands.listPendingInvitations).not.toHaveBeenCalled();
  });

  it("maps provider roles without leaking provider-only keys", async () => {
    const test = setup();
    test.commands.listPendingInvitations.mockResolvedValue([
      {
        createdAt: new Date("2026-07-16T12:00:00.000Z"),
        email: "admin@example.com",
        id: "a",
        role: "org:admin",
      },
      {
        createdAt: new Date("2026-07-16T12:01:00.000Z"),
        email: "member@example.com",
        id: "m",
        role: "org:member",
      },
    ]);

    const result = await membersOrganizationHandler({
      ctx,
      dependencies: test.dependencies,
      input: { organizationId: 41 },
    });

    expect(result.pendingInvitations.map(({ role }) => role)).toEqual(["ADMIN", "MEMBER"]);
    expect(forbiddenOutputKeys(result)).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/provider-only|provider\.test|never-return/);
  });

  it("passes only authenticated actor and IDs to invitation commands", async () => {
    const test = setup();

    await revokeOrganizationInvitationHandler({
      ctx,
      dependencies: test.dependencies,
      input: { invitationId: "inv_1", organizationId: 41 },
    });
    await resendOrganizationInvitationHandler({
      ctx,
      dependencies: test.dependencies,
      input: { invitationId: "inv_1", organizationId: 41 },
    });

    const command = { actorUserId: 7, invitationId: "inv_1", organizationId: 41 };
    expect(test.commands.revokeInvitation).toHaveBeenCalledWith(command);
    expect(test.commands.resendInvitation).toHaveBeenCalledWith(command);
  });

  it("accepts invitation commands without browser-supplied invitation data", () => {
    expect(ZOrganizationInvitationSchema.parse({ invitationId: "inv_1", organizationId: 41 })).toEqual({
      invitationId: "inv_1",
      organizationId: 41,
    });
    expect(() => ZOrganizationInvitationSchema.parse({ invitationId: "", organizationId: 41 })).toThrow();
    expect(() =>
      ZOrganizationInvitationSchema.parse({ invitationId: "x".repeat(129), organizationId: 41 })
    ).toThrow();
  });
});
