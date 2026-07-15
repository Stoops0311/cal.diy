import { prisma } from "@calcom/prisma";

type LocalUserProjection = {
  billingSubscription?: { id: string } | null;
  clerkUserId?: string | null;
  email?: string;
  id: number;
};
type BillingProjection = {
  cancelAtPeriodEnd: boolean;
  interval: "MONTH" | "YEAR" | null;
  plan: "FREE" | "PRO" | "TEAM";
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  seatCount: number;
  status: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID";
};
type ExpectedBillingProjection = Pick<
  BillingProjection,
  "cancelAtPeriodEnd" | "interval" | "plan" | "seatCount" | "status"
>;
type DatabaseAssertionClient = {
  billingSubscription: {
    findUnique(input: {
      select: {
        cancelAtPeriodEnd: true;
        interval: true;
        plan: true;
        polarCustomerId: true;
        polarSubscriptionId: true;
        seatCount: true;
        status: true;
      };
      where: { subjectKey: string };
    }): Promise<BillingProjection | null>;
  };
  user: {
    findMany(input: {
      select: { billingSubscription: { select: { id: true } }; clerkUserId: true; email: true; id: true };
      take: number;
      where: { email: { equals: string; mode: "insensitive" } };
    }): Promise<LocalUserProjection[]>;
  };
};

const userSelect = {
  billingSubscription: { select: { id: true } },
  clerkUserId: true,
  email: true,
  id: true,
} as const;

const billingSelect = {
  cancelAtPeriodEnd: true,
  interval: true,
  plan: true,
  polarCustomerId: true,
  polarSubscriptionId: true,
  seatCount: true,
  status: true,
} as const;

async function assertOneLocalUser(
  email: string,
  expectedClerkUserId?: string,
  database: DatabaseAssertionClient = prisma
): Promise<LocalUserProjection> {
  const users = await database.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: userSelect,
    take: 2,
  });
  if (users.length !== 1) throw new Error(`Expected exactly one local user for ${email}`);
  const user = users[0];
  if (!user) throw new Error(`Expected one local user for ${email}`);
  if (expectedClerkUserId && user.clerkUserId !== expectedClerkUserId) {
    throw new Error("Clerk user mapping mismatch");
  }
  return user;
}

async function waitForOneLocalUser(
  email: string,
  expectedClerkUserId: string,
  database: DatabaseAssertionClient = prisma,
  timeoutMs = 30_000
): Promise<LocalUserProjection> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await assertOneLocalUser(email, expectedClerkUserId, database);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return assertOneLocalUser(email, expectedClerkUserId, database);
}

async function assertBillingProjection(
  subjectKey: string,
  expected: ExpectedBillingProjection,
  database: DatabaseAssertionClient = prisma
): Promise<BillingProjection> {
  const projection = await database.billingSubscription.findUnique({
    where: { subjectKey },
    select: billingSelect,
  });
  if (!projection) throw new Error(`Missing billing projection for ${subjectKey}`);
  for (const [key, value] of Object.entries(expected)) {
    if (projection[key as keyof ExpectedBillingProjection] !== value) {
      throw new Error(`Billing projection mismatch for ${key}`);
    }
  }
  return projection;
}

export { assertBillingProjection, assertOneLocalUser, waitForOneLocalUser };
export type { BillingProjection, DatabaseAssertionClient, ExpectedBillingProjection, LocalUserProjection };
