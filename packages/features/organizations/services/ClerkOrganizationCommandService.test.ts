import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it, vi } from "vitest";

const { defaultSeatSync } = vi.hoisted(() => ({ defaultSeatSync: vi.fn() }));

vi.mock("@calcom/features/billing/services/PolarSeatService", () => ({
  PolarSeatService: class {
    syncAcceptedSeats = defaultSeatSync;
  },
}));

import {
  type ClerkOrganizationCommandDependencies,
  ClerkOrganizationCommandService,
} from "./ClerkOrganizationCommandService";

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
  const dependencies: ClerkOrganizationCommandDependencies = {
    clerk,
    organizationSource,
    reconciler,
    repository,
    seatBilling,
  };
  return { clerk, dependencies, order, organizationSource, reconciler, repository, seatBilling, snapshot };
}

describe("ClerkOrganizationCommandService", () => {
  it("uses Polar seat billing by default", async () => {
    const ctx = setup();
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
