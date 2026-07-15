import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it } from "vitest";

const createdUserIds: number[] = [];

describe("Clerk user mapping", () => {
  afterEach(async () => {
    if (createdUserIds.length === 0) return;

    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds.splice(0) } },
    });
  });

  it("persists a Clerk user id", async () => {
    const user = await prisma.user.create({
      data: {
        clerkUserId: `user_${crypto.randomUUID()}`,
        email: `clerk-map-${crypto.randomUUID()}@example.com`,
      },
      select: {
        clerkUserId: true,
        id: true,
      },
    });

    createdUserIds.push(user.id);

    expect(user.clerkUserId).toMatch(/^user_/);
  });
});
