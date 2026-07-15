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
} from "./ClerkOrganizationCommandService";

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
    removeMember: vi.fn(async () => order.push("clerk")),
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
