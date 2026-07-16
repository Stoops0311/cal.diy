import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it, vi } from "vitest";
import { getEntitlements } from "../../billing/lib/entitlements";
import { BillingStatus, PlanKey } from "../../billing/lib/plans";

const { defaultOrganizationEntitlements, defaultSeatSync } = vi.hoisted(() => ({
  defaultOrganizationEntitlements: vi.fn(),
  defaultSeatSync: vi.fn(),
}));

vi.mock("@calcom/features/billing/services/EntitlementService", () => ({
  EntitlementService: class {
    forOrganization = defaultOrganizationEntitlements;
  },
}));

vi.mock("@calcom/features/billing/services/PolarSeatService", () => ({
  PolarSeatService: class {
    syncAcceptedSeats = defaultSeatSync;
  },
}));

import {
  type ClerkOrganizationCommandDependencies,
  ClerkOrganizationCommandService,
  listAllPendingOrganizationInvitations,
  mapPendingOrganizationInvitation,
} from "./ClerkOrganizationCommandService";

function providerInvitations(count = 12) {
  return Array.from({ length: count }, (_, index) => ({
    createdAt: Date.UTC(2026, 6, 16, 12, index),
    emailAddress: `pending-${index + 1}@example.com`,
    id: `invitation_${index + 1}`,
    privateMetadata: { providerOnly: true },
    role: "org:member" as const,
    status: "pending" as const,
    url: `https://clerk.test/invitations/${index + 1}`,
  }));
}

function pagedProvider(rows = providerInvitations()) {
  const fetchPage = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => ({
    data: rows.slice(offset, offset + Math.min(limit, 10)),
    totalCount: rows.length,
  }));
  return {
    fetchPage,
    list: () => listAllPendingOrganizationInvitations("org_clerk", fetchPage),
    rows,
  };
}

function freeEntitlements(acceptedOrganizationMembers = 1) {
  return {
    ...getEntitlements(null),
    usage: { acceptedOrganizationMembers, activePersonalEventTypes: 0, connectedCalendars: 0 },
  };
}

function teamEntitlements() {
  return {
    ...getEntitlements({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
      plan: PlanKey.TEAM,
      status: BillingStatus.ACTIVE,
    }),
    usage: { acceptedOrganizationMembers: 1, activePersonalEventTypes: 0, connectedCalendars: 0 },
  };
}

function setup() {
  const order: string[] = [];
  const pendingInvitation = {
    createdAt: new Date("2026-07-16T12:00:00.000Z"),
    email: "pending@example.com",
    id: "invitation_1",
    role: "org:member" as const,
  };
  const snapshot = {
    creatorClerkUserId: "user_owner",
    deleted: false,
    id: "org_clerk",
    memberships: [{ active: true, clerkUserId: "user_owner", role: "org:admin" as const }],
    name: "Acme",
    slug: "acme",
  };
  const clerk = {
    archiveOrganization: vi.fn(async () => order.push("clerk")),
    changeMemberRole: vi.fn(async () => order.push("clerk")),
    createOrganization: vi.fn(async () => {
      order.push("clerk");
      return "org_clerk";
    }),
    inviteMember: vi.fn(async () => order.push("clerk")),
    listPendingInvitations: vi.fn(async () => {
      order.push("list");
      return [pendingInvitation];
    }),
    removeMember: vi.fn(async () => order.push("clerk")),
    revokeInvitation: vi.fn(async () => order.push("revoke")),
  };
  const repository = {
    getActorClerkUserId: vi.fn().mockResolvedValue("user_owner"),
    getOwnedOrganizationIds: vi.fn().mockResolvedValue([]),
    getOrganizationAccess: vi.fn().mockResolvedValue({
      actorRole: "OWNER" as const,
      archivedAt: null,
      clerkOrganizationId: "org_clerk",
    }),
    getTargetMember: vi.fn().mockResolvedValue({
      accepted: true,
      clerkUserId: "user_member",
      role: "MEMBER" as const,
    }),
    ownerCount: vi.fn().mockResolvedValue(1),
  };
  const organizationSource = {
    getSnapshot: vi.fn(async () => {
      order.push("snapshot");
      return snapshot;
    }),
  };
  const reconciler = {
    reconcileOrganization: vi.fn(async () => {
      order.push("reconcile");
      return { acceptedSeats: 1, archived: false, organizationId: 41 };
    }),
  };
  const seatBilling = {
    syncAcceptedSeats: vi.fn(async () => order.push("billing")),
  };
  const entitlements = {
    forOrganization: vi.fn(async () => teamEntitlements()),
  };
  const dependencies: ClerkOrganizationCommandDependencies = {
    clerk,
    entitlements,
    organizationSource,
    reconciler,
    repository,
    seatBilling,
  };
  return {
    clerk,
    dependencies,
    entitlements,
    order,
    organizationSource,
    pendingInvitation,
    reconciler,
    repository,
    seatBilling,
    snapshot,
  };
}

describe("ClerkOrganizationCommandService", () => {
  it("uses Polar seat billing by default", async () => {
    const ctx = setup();
    defaultOrganizationEntitlements.mockResolvedValueOnce(teamEntitlements());
    defaultSeatSync.mockRejectedValueOnce(
      new ErrorWithCode(ErrorCode.InternalServerError, "Polar seat adapter called")
    );
    const service = new ClerkOrganizationCommandService();

    await expect(
      service.activateAcceptedMember({ organizationId: 41, snapshot: ctx.snapshot })
    ).rejects.toMatchObject({ code: ErrorCode.InternalServerError });
    expect(defaultSeatSync).toHaveBeenCalledWith({ desiredSeats: 1, organizationId: 41 });
  });

  it("creates in Clerk before reconciling local state", async () => {
    const ctx = setup();
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await service.createOrganization({ actorUserId: 7, name: "Acme", slug: "acme" });

    expect(ctx.clerk.createOrganization).toHaveBeenCalledWith({
      creatorClerkUserId: "user_owner",
      name: "Acme",
      slug: "acme",
    });
    expect(ctx.order).toEqual(["clerk", "snapshot", "reconcile"]);
  });

  it("denies a second provisional organization", async () => {
    const ctx = setup();
    ctx.repository.getOwnedOrganizationIds.mockResolvedValue([41]);
    ctx.entitlements.forOrganization.mockResolvedValue(freeEntitlements());
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.createOrganization({ actorUserId: 7, name: "Second", slug: "second" })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(ctx.clerk.createOrganization).not.toHaveBeenCalled();
  });

  it("allows another separately billed organization after existing organizations have Team", async () => {
    const ctx = setup();
    ctx.repository.getOwnedOrganizationIds.mockResolvedValue([41]);
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.createOrganization({ actorUserId: 7, name: "Second", slug: "second" })
    ).resolves.toMatchObject({ organizationId: 41 });
    expect(ctx.entitlements.forOrganization).toHaveBeenCalledWith(41);
    expect(ctx.clerk.createOrganization).toHaveBeenCalledOnce();
  });

  it("denies organization commands to accepted members", async () => {
    const ctx = setup();
    ctx.repository.getOrganizationAccess.mockResolvedValue({
      actorRole: "MEMBER",
      archivedAt: null,
      clerkOrganizationId: "org_clerk",
    });
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.inviteMember({
        actorUserId: 7,
        email: "new@example.com",
        organizationId: 41,
        role: "org:member",
      })
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    expect(ctx.clerk.inviteMember).not.toHaveBeenCalled();
  });

  it("keeps provisional organizations read-only until Team is verified", async () => {
    const ctx = setup();
    ctx.entitlements.forOrganization.mockResolvedValue(freeEntitlements());
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.inviteMember({
        actorUserId: 7,
        email: "new@example.com",
        organizationId: 41,
        role: "org:member",
      })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(ctx.clerk.inviteMember).not.toHaveBeenCalled();
  });

  it("lists only the safe pending invitation projection", async () => {
    const ctx = setup();
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(service.listPendingInvitations({ actorUserId: 7, organizationId: 41 })).resolves.toEqual([
      ctx.pendingInvitation,
    ]);
    expect(ctx.clerk.listPendingInvitations).toHaveBeenCalledWith("org_clerk");
  });

  it("maps raw Clerk invitations to exactly the safe projection", () => {
    const [raw] = providerInvitations(1);
    if (!raw) throw new Error("Expected a provider invitation");

    const mapped = mapPendingOrganizationInvitation(raw);

    expect(mapped).toEqual({
      createdAt: new Date("2026-07-16T12:00:00.000Z"),
      email: "pending-1@example.com",
      id: "invitation_1",
      role: "org:member",
    });
    expect(Object.keys(mapped).sort()).toEqual(["createdAt", "email", "id", "role"]);
  });

  it("loads every provider page until totalCount is exhausted", async () => {
    const ctx = setup();
    const provider = pagedProvider();
    ctx.clerk.listPendingInvitations.mockImplementation(provider.list);
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.listPendingInvitations({ actorUserId: 7, organizationId: 41 })
    ).resolves.toHaveLength(12);
    expect(provider.fetchPage).toHaveBeenNthCalledWith(1, {
      limit: 500,
      offset: 0,
      organizationId: "org_clerk",
      status: ["pending"],
    });
    expect(provider.fetchPage).toHaveBeenNthCalledWith(2, {
      limit: 500,
      offset: 10,
      organizationId: "org_clerk",
      status: ["pending"],
    });
  });

  it("detects a duplicate email on a later provider page", async () => {
    const ctx = setup();
    const provider = pagedProvider();
    ctx.clerk.listPendingInvitations.mockImplementation(provider.list);
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.inviteMember({
        actorUserId: 7,
        email: "PENDING-12@EXAMPLE.COM",
        organizationId: 41,
        role: "org:member",
      })
    ).rejects.toMatchObject({ code: ErrorCode.ClerkOrganizationInvitationDuplicate });
    expect(provider.fetchPage).toHaveBeenCalledTimes(2);
    expect(ctx.clerk.inviteMember).not.toHaveBeenCalled();
  });

  it("revokes an invitation found on a later provider page", async () => {
    const ctx = setup();
    const provider = pagedProvider();
    ctx.clerk.listPendingInvitations.mockImplementation(provider.list);
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await service.revokeInvitation({ actorUserId: 7, invitationId: "invitation_12", organizationId: 41 });

    expect(provider.fetchPage).toHaveBeenCalledTimes(2);
    expect(ctx.clerk.revokeInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: "invitation_12" })
    );
  });

  it("resends an invitation found on a later provider page", async () => {
    const ctx = setup();
    const provider = pagedProvider();
    ctx.clerk.listPendingInvitations.mockImplementation(provider.list);
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await service.resendInvitation({ actorUserId: 7, invitationId: "invitation_12", organizationId: 41 });

    expect(provider.fetchPage).toHaveBeenCalledTimes(2);
    expect(ctx.clerk.inviteMember).toHaveBeenCalledWith(
      expect.objectContaining({ email: "pending-12@example.com", role: "org:member" })
    );
  });

  it("denies pending invitation access to ordinary members", async () => {
    const ctx = setup();
    ctx.repository.getOrganizationAccess.mockResolvedValue({
      actorRole: "MEMBER",
      archivedAt: null,
      clerkOrganizationId: "org_clerk",
    });
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.listPendingInvitations({ actorUserId: 7, organizationId: 41 })
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    expect(ctx.clerk.listPendingInvitations).not.toHaveBeenCalled();
  });

  it("sanitizes pending invitation provider failures", async () => {
    const ctx = setup();
    ctx.clerk.listPendingInvitations.mockRejectedValue(new Error("secret Clerk response"));
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    const operation = service.listPendingInvitations({ actorUserId: 7, organizationId: 41 });
    await expect(operation).rejects.toMatchObject({
      code: ErrorCode.ClerkOrganizationConflict,
      message: "Clerk organization operation failed",
    });
  });

  it("rejects a duplicate pending invitation after normalizing the email", async () => {
    const ctx = setup();
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.inviteMember({
        actorUserId: 7,
        email: "  PENDING@EXAMPLE.COM ",
        organizationId: 41,
        role: "org:member",
      })
    ).rejects.toMatchObject({ code: ErrorCode.ClerkOrganizationInvitationDuplicate });
    expect(ctx.clerk.inviteMember).not.toHaveBeenCalled();
  });

  it("blocks a new invitation when all 50 accepted seats are used", async () => {
    const ctx = setup();
    ctx.entitlements.forOrganization.mockResolvedValue({
      ...teamEntitlements(),
      usage: { acceptedOrganizationMembers: 50, activePersonalEventTypes: 0, connectedCalendars: 0 },
    });
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.inviteMember({
        actorUserId: 7,
        email: "new@example.com",
        organizationId: 41,
        role: "org:member",
      })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementLimitExceeded });
    expect(ctx.clerk.inviteMember).not.toHaveBeenCalled();
  });

  it("revokes a known pending invitation as the Clerk actor", async () => {
    const ctx = setup();
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await service.revokeInvitation({ actorUserId: 7, invitationId: "invitation_1", organizationId: 41 });

    expect(ctx.clerk.revokeInvitation).toHaveBeenCalledWith({
      clerkOrganizationId: "org_clerk",
      invitationId: "invitation_1",
      requestingClerkUserId: "user_owner",
    });
    expect(ctx.order).toEqual(["list", "revoke"]);
  });

  it("rejects an unknown opaque invitation ID", async () => {
    const ctx = setup();
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.resendInvitation({ actorUserId: 7, invitationId: "unknown", organizationId: 41 })
    ).rejects.toMatchObject({ code: ErrorCode.NotFound });
    expect(ctx.clerk.revokeInvitation).not.toHaveBeenCalled();
    expect(ctx.clerk.inviteMember).not.toHaveBeenCalled();
  });

  it("revokes before recreating a resend with provider-sourced fields", async () => {
    const ctx = setup();
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await service.resendInvitation({ actorUserId: 7, invitationId: "invitation_1", organizationId: 41 });

    expect(ctx.clerk.inviteMember).toHaveBeenCalledWith({
      clerkOrganizationId: "org_clerk",
      email: "pending@example.com",
      inviterClerkUserId: "user_owner",
      role: "org:member",
    });
    expect(ctx.order).toEqual(["list", "revoke", "clerk"]);
  });

  it("blocks role changes when Team is no longer active", async () => {
    const ctx = setup();
    ctx.entitlements.forOrganization.mockResolvedValue(freeEntitlements());
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.changeMemberRole({
        actorUserId: 7,
        memberUserId: 9,
        organizationId: 41,
        role: "org:admin",
      })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(ctx.clerk.changeMemberRole).not.toHaveBeenCalled();
  });

  it("blocks member removal when Team is no longer active", async () => {
    const ctx = setup();
    ctx.entitlements.forOrganization.mockResolvedValue(freeEntitlements());
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.removeMember({ actorUserId: 7, memberUserId: 9, organizationId: 41 })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(ctx.clerk.removeMember).not.toHaveBeenCalled();
  });

  it("keeps archived organizations read-only", async () => {
    const ctx = setup();
    ctx.repository.getOrganizationAccess.mockResolvedValue({
      actorRole: "OWNER",
      archivedAt: new Date("2026-07-15T12:00:00.000Z"),
      clerkOrganizationId: "org_clerk",
    });
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(service.archiveOrganization({ actorUserId: 7, organizationId: 41 })).rejects.toMatchObject({
      code: ErrorCode.ClerkOrganizationConflict,
    });
    expect(ctx.clerk.archiveOrganization).not.toHaveBeenCalled();
  });

  it("does not activate a member when seat synchronization fails", async () => {
    const ctx = setup();
    ctx.snapshot.memberships.push({ active: true, clerkUserId: "user_member", role: "org:member" });
    ctx.seatBilling.syncAcceptedSeats.mockRejectedValue(
      new ErrorWithCode(ErrorCode.EntitlementLimitExceeded, "Seat update failed")
    );
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.activateAcceptedMember({ organizationId: 41, snapshot: ctx.snapshot })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementLimitExceeded });
    expect(ctx.reconciler.reconcileOrganization).not.toHaveBeenCalled();
  });

  it("does not activate accepted members for an inactive Team organization", async () => {
    const ctx = setup();
    ctx.entitlements.forOrganization.mockResolvedValue(freeEntitlements());
    ctx.snapshot.memberships.push({ active: true, clerkUserId: "user_member", role: "org:member" });
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.activateAcceptedMember({ organizationId: 41, snapshot: ctx.snapshot })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementRequired });
    expect(ctx.seatBilling.syncAcceptedSeats).not.toHaveBeenCalled();
    expect(ctx.reconciler.reconcileOrganization).not.toHaveBeenCalled();
  });

  it("does not activate a fifty-first accepted member", async () => {
    const ctx = setup();
    ctx.snapshot.memberships = Array.from({ length: 51 }, (_, index) => ({
      active: true,
      clerkUserId: `user_${index}`,
      role: "org:member" as const,
    }));
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.activateAcceptedMember({ organizationId: 41, snapshot: ctx.snapshot })
    ).rejects.toMatchObject({ code: ErrorCode.EntitlementLimitExceeded });
    expect(ctx.seatBilling.syncAcceptedSeats).not.toHaveBeenCalled();
    expect(ctx.reconciler.reconcileOrganization).not.toHaveBeenCalled();
  });

  it("decrements seats after Clerk removal and before local reconciliation", async () => {
    const ctx = setup();
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await service.removeMember({ actorUserId: 7, memberUserId: 9, organizationId: 41 });

    expect(ctx.clerk.removeMember).toHaveBeenCalledWith({
      clerkOrganizationId: "org_clerk",
      clerkUserId: "user_member",
    });
    expect(ctx.seatBilling.syncAcceptedSeats).toHaveBeenCalledWith({ desiredSeats: 1, organizationId: 41 });
    expect(ctx.order).toEqual(["clerk", "snapshot", "billing", "reconcile"]);
  });

  it("refuses to remove the last local owner", async () => {
    const ctx = setup();
    ctx.repository.getTargetMember.mockResolvedValue({
      accepted: true,
      clerkUserId: "user_owner",
      role: "OWNER",
    });
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.removeMember({ actorUserId: 7, memberUserId: 7, organizationId: 41 })
    ).rejects.toMatchObject({ code: ErrorCode.ClerkOrganizationOwnerRequired });
    expect(ctx.clerk.removeMember).not.toHaveBeenCalled();
  });

  it("treats an already-applied role change as an idempotent retry", async () => {
    const ctx = setup();
    ctx.clerk.changeMemberRole.mockRejectedValue(new Error("provider timeout"));
    ctx.snapshot.memberships.push({ active: true, clerkUserId: "user_member", role: "org:admin" });
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.changeMemberRole({
        actorUserId: 7,
        memberUserId: 9,
        organizationId: 41,
        role: "org:admin",
      })
    ).resolves.toBeUndefined();
    expect(ctx.reconciler.reconcileOrganization).toHaveBeenCalledWith(ctx.snapshot);
  });

  it("sanitizes provider failures that were not already applied", async () => {
    const ctx = setup();
    ctx.clerk.changeMemberRole.mockRejectedValue(new Error("secret provider response"));
    const service = new ClerkOrganizationCommandService(ctx.dependencies);

    await expect(
      service.changeMemberRole({
        actorUserId: 7,
        memberUserId: 9,
        organizationId: 41,
        role: "org:admin",
      })
    ).rejects.toMatchObject({ code: ErrorCode.ClerkOrganizationConflict });
  });
});
