import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type { BillingSubscription } from "@calcom/prisma/client";
import type { BillingStatus } from "@calcom/prisma/enums";
import { type PolarEnvironment, resolveConfiguredPolarProduct } from "./PolarClient";

type PolarCustomerStateSnapshot = {
  activeBenefits: string[];
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  customerId: string;
  effectiveAt: Date;
  eventId: string;
  externalCustomerId: string;
  productId: string;
  productMetadata: Record<string, unknown>;
  seats: number;
  status: "active" | "canceled" | "past_due" | "trialing" | "unpaid";
  subscriptionId: string;
};

type BillingSubject =
  | { organizationId: number; subjectKey: string; type: "ORGANIZATION" }
  | { subjectKey: string; type: "USER"; userId: number };

const statusMap = {
  active: "ACTIVE",
  canceled: "CANCELED",
  past_due: "PAST_DUE",
  trialing: "TRIALING",
  unpaid: "UNPAID",
} as const satisfies Record<PolarCustomerStateSnapshot["status"], BillingStatus>;

function projectionConflict(message: string): ErrorWithCode {
  return new ErrorWithCode(ErrorCode.PolarProjectionConflict, message);
}

class PolarSubscriptionProjectionService {
  constructor(private readonly environment?: PolarEnvironment) {}

  async projectCustomerState(
    snapshot: PolarCustomerStateSnapshot
  ): Promise<{ applied: boolean; subscription: BillingSubscription }> {
    const subject = await this.resolveSubject(snapshot.externalCustomerId);
    let product: ReturnType<typeof resolveConfiguredPolarProduct>;
    try {
      product = resolveConfiguredPolarProduct(snapshot.productId, snapshot.productMetadata, this.environment);
    } catch {
      throw projectionConflict("Polar product configuration does not match the customer state");
    }

    if (product.plan === "PRO" && subject.type !== "USER") {
      throw projectionConflict("Pro subscriptions require a user subject");
    }
    if (product.plan === "TEAM" && subject.type !== "ORGANIZATION") {
      throw projectionConflict("Team subscriptions require an organization subject");
    }
    if (product.plan === "TEAM" && (snapshot.seats < 1 || snapshot.seats > 50)) {
      throw projectionConflict("Team seats must be between one and fifty");
    }

    const expectedBenefit = product.plan === "PRO" ? "convenio-pro" : "convenio-team";
    const paidBenefitActive = snapshot.activeBenefits.includes(expectedBenefit);
    const plan = paidBenefitActive ? product.plan : "FREE";
    const interval = paidBenefitActive ? product.interval : null;
    const status = paidBenefitActive ? statusMap[snapshot.status] : "NONE";
    const seatCount = paidBenefitActive && product.plan === "TEAM" ? snapshot.seats : 1;

    return prisma.$transaction(async (tx) => {
      const existing = await tx.billingSubscription.findUnique({
        where: { subjectKey: subject.subjectKey },
      });
      if (existing?.latestEffectiveAt && existing.latestEffectiveAt >= snapshot.effectiveAt) {
        const repairsIdentifiers =
          (!existing.polarCustomerId && Boolean(snapshot.customerId)) ||
          (!existing.polarSubscriptionId && Boolean(snapshot.subscriptionId));
        if (!repairsIdentifiers) return { applied: false, subscription: existing };

        const subscription = await tx.billingSubscription.update({
          where: { subjectKey: subject.subjectKey },
          data: {
            polarCustomerId: existing.polarCustomerId ?? snapshot.customerId,
            polarSubscriptionId: existing.polarSubscriptionId ?? snapshot.subscriptionId,
          },
        });
        return { applied: true, subscription };
      }

      const subjectRelation =
        subject.type === "USER"
          ? { organizationId: null, userId: subject.userId }
          : { organizationId: subject.organizationId, userId: null };
      const subscription = await tx.billingSubscription.upsert({
        where: { subjectKey: subject.subjectKey },
        create: {
          ...subjectRelation,
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
          currentPeriodEnd: snapshot.currentPeriodEnd,
          currentPeriodStart: snapshot.currentPeriodStart,
          interval,
          latestEffectiveAt: snapshot.effectiveAt,
          plan,
          polarCustomerId: snapshot.customerId,
          polarProductId: snapshot.productId,
          polarSubscriptionId: snapshot.subscriptionId,
          providerModifiedAt: snapshot.effectiveAt,
          seatCount,
          status,
          subjectKey: subject.subjectKey,
        },
        update: {
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
          currentPeriodEnd: snapshot.currentPeriodEnd,
          currentPeriodStart: snapshot.currentPeriodStart,
          interval,
          latestEffectiveAt: snapshot.effectiveAt,
          plan,
          polarCustomerId: snapshot.customerId,
          polarProductId: snapshot.productId,
          polarSubscriptionId: snapshot.subscriptionId,
          providerModifiedAt: snapshot.effectiveAt,
          seatCount,
          status,
        },
      });
      return { applied: true, subscription };
    });
  }

  private async resolveSubject(externalCustomerId: string): Promise<BillingSubject> {
    if (externalCustomerId.startsWith("user:")) {
      const clerkUserId = externalCustomerId.slice("user:".length);
      const user = await prisma.user.findUnique({ where: { clerkUserId }, select: { id: true } });
      if (user) return { subjectKey: `user:${user.id}`, type: "USER", userId: user.id };
    }
    if (externalCustomerId.startsWith("org:")) {
      const clerkOrganizationId = externalCustomerId.slice("org:".length);
      const organization = await prisma.team.findUnique({
        where: { clerkOrganizationId },
        select: { id: true },
      });
      if (organization) {
        return {
          organizationId: organization.id,
          subjectKey: `organization:${organization.id}`,
          type: "ORGANIZATION",
        };
      }
    }
    throw new ErrorWithCode(ErrorCode.PolarSubjectNotFound, "Polar customer subject is not mapped");
  }
}

export { PolarSubscriptionProjectionService };
export type { PolarCustomerStateSnapshot };
