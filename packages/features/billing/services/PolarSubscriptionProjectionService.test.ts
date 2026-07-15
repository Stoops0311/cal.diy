import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it } from "vitest";

const createdUserIds: number[] = [];
const createdOrganizationIds: number[] = [];

describe("BillingSubscription persistence", () => {
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
    }
    if (createdOrganizationIds.length > 0) {
      await prisma.team.deleteMany({ where: { id: { in: createdOrganizationIds.splice(0) } } });
    }
  });

  it("stores one subscription for a user subject", async () => {
    const user = await prisma.user.create({
      data: { email: `polar-${crypto.randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const subscription = await prisma.billingSubscription.create({
      data: { subjectKey: `user:${user.id}`, userId: user.id },
      select: { plan: true, seatCount: true, status: true, subjectKey: true },
    });

    expect(subscription).toEqual({
      plan: "FREE",
      seatCount: 1,
      status: "NONE",
      subjectKey: `user:${user.id}`,
    });
  });

  it("stores one subscription for an organization subject", async () => {
    const organization = await prisma.team.create({
      data: { isOrganization: true, name: `Polar ${crypto.randomUUID()}` },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    await expect(
      prisma.billingSubscription.create({
        data: {
          organizationId: organization.id,
          seatCount: 50,
          subjectKey: `organization:${organization.id}`,
        },
        select: { organizationId: true, seatCount: true },
      })
    ).resolves.toEqual({ organizationId: organization.id, seatCount: 50 });
  });

  it("rejects a subscription with both subject relations", async () => {
    const user = await prisma.user.create({
      data: { email: `polar-${crypto.randomUUID()}@example.com` },
      select: { id: true },
    });
    const organization = await prisma.team.create({
      data: { isOrganization: true, name: `Polar ${crypto.randomUUID()}` },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    createdOrganizationIds.push(organization.id);

    await expect(
      prisma.billingSubscription.create({
        data: {
          organizationId: organization.id,
          subjectKey: `user:${user.id}`,
          userId: user.id,
        },
      })
    ).rejects.toThrow();
  });

  it("rejects subscriptions outside the supported seat range", async () => {
    const user = await prisma.user.create({
      data: { email: `polar-${crypto.randomUUID()}@example.com` },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await expect(
      prisma.billingSubscription.create({
        data: { seatCount: 51, subjectKey: `user:${user.id}`, userId: user.id },
      })
    ).rejects.toThrow();
  });
});
