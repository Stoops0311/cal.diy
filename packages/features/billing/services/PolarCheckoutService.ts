import process from "node:process";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type { MembershipRole } from "@calcom/prisma/enums";
import type { BillingIntervalType, PaidPlanKey } from "../lib/plans";
import type { PolarBillingGateway } from "./PolarBillingGateway";
import { PolarSdkBillingGateway } from "./PolarBillingGateway";
import { getPolarProduct, type PolarEnvironment } from "./PolarClient";
import {
  type PolarCustomerStateSnapshot,
  PolarSubscriptionProjectionService,
} from "./PolarSubscriptionProjectionService";

type UserBillingSubject = {
  customerEmail: string;
  customerName: string | null;
  externalCustomerId: string;
  subjectKey: string;
  type: "USER";
  userId: number;
};
type OrganizationBillingSubject = {
  acceptedSeats: number;
  actorRole: MembershipRole;
  customerEmail: string;
  customerName: string;
  externalCustomerId: string;
  organizationId: number;
  subjectKey: string;
  type: "ORGANIZATION";
};
type BillingSubject = OrganizationBillingSubject | UserBillingSubject;

type BillingSubjectRepository = {
  getBillingSubscription(subjectKey: string): Promise<{ polarSubscriptionId: string | null } | null>;
  getOrganizationSubject(actorUserId: number, organizationId: number): Promise<OrganizationBillingSubject>;
  getUserSubject(actorUserId: number): Promise<UserBillingSubject>;
};
type PolarCheckoutServiceDependencies = {
  environment: PolarEnvironment;
  gateway: PolarBillingGateway;
  projection: Pick<PolarSubscriptionProjectionService, "projectCustomerState">;
  repository: BillingSubjectRepository;
  webAppUrl: string;
};

function providerFailure(): ErrorWithCode {
  return new ErrorWithCode(ErrorCode.InternalServerError, "Polar subscription operation failed");
}

class PrismaBillingSubjectRepository implements BillingSubjectRepository {
  async getUserSubject(actorUserId: number): Promise<UserBillingSubject> {
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { clerkUserId: true, email: true, name: true },
    });
    if (!user?.clerkUserId) throw new ErrorWithCode(ErrorCode.Forbidden, "Clerk identity is required");
    return {
      customerEmail: user.email,
      customerName: user.name,
      externalCustomerId: `user:${user.clerkUserId}`,
      subjectKey: `user:${actorUserId}`,
      type: "USER",
      userId: actorUserId,
    };
  }

  async getOrganizationSubject(
    actorUserId: number,
    organizationId: number
  ): Promise<OrganizationBillingSubject> {
    const [organization, acceptedSeats] = await Promise.all([
      prisma.team.findUnique({
        where: { id: organizationId },
        select: {
          archivedAt: true,
          clerkOrganizationId: true,
          name: true,
          members: {
            where: { accepted: true, userId: actorUserId },
            select: { role: true, user: { select: { email: true } } },
          },
        },
      }),
      prisma.membership.count({ where: { accepted: true, teamId: organizationId } }),
    ]);
    const actor = organization?.members[0];
    if (!organization?.clerkOrganizationId || organization.archivedAt || !actor) {
      throw new ErrorWithCode(ErrorCode.Forbidden, "Organization billing access denied");
    }
    return {
      acceptedSeats,
      actorRole: actor.role,
      customerEmail: actor.user.email,
      customerName: organization.name,
      externalCustomerId: `org:${organization.clerkOrganizationId}`,
      organizationId,
      subjectKey: `organization:${organizationId}`,
      type: "ORGANIZATION",
    };
  }

  async getBillingSubscription(subjectKey: string): Promise<{ polarSubscriptionId: string | null } | null> {
    return prisma.billingSubscription.findUnique({
      where: { subjectKey },
      select: { polarSubscriptionId: true },
    });
  }
}

class PolarCheckoutService {
  private readonly dependencies: PolarCheckoutServiceDependencies;

  constructor(dependencies?: PolarCheckoutServiceDependencies) {
    const environment = dependencies?.environment ?? process.env;
    this.dependencies = dependencies ?? {
      environment,
      gateway: new PolarSdkBillingGateway(environment),
      projection: new PolarSubscriptionProjectionService(environment),
      repository: new PrismaBillingSubjectRepository(),
      webAppUrl: WEBAPP_URL,
    };
  }

  async createCheckout(
    actorUserId: number,
    input: { interval: BillingIntervalType; organizationId?: number; plan: PaidPlanKey }
  ): Promise<{ checkoutUrl: string }> {
    const subject = await this.resolvePlanSubject(actorUserId, input.plan, input.organizationId);
    const product = getPolarProduct(input.plan, input.interval, this.dependencies.environment);
    const seats = subject.type === "ORGANIZATION" ? this.requireSeats(subject.acceptedSeats) : undefined;
    try {
      const checkout = await this.dependencies.gateway.createCheckout({
        allowTrial: true,
        customerEmail: subject.customerEmail,
        customerName: subject.customerName,
        externalCustomerId: subject.externalCustomerId,
        ...(subject.type === "ORGANIZATION"
          ? { isBusinessCustomer: true, maxSeats: 50, minSeats: 1, seats }
          : {}),
        metadata: {
          billing_interval: input.interval,
          plan_key: input.plan,
          ...(seats ? { seats } : {}),
          subject_key: subject.subjectKey,
          subject_type: subject.type,
        },
        products: [product.id],
        returnUrl: new URL("/pricing", this.dependencies.webAppUrl).toString(),
        successUrl: new URL(
          "/settings/billing?checkout_id={CHECKOUT_ID}",
          this.dependencies.webAppUrl
        ).toString(),
      });
      return { checkoutUrl: checkout.url };
    } catch {
      throw providerFailure();
    }
  }

  async createPortalSession(
    actorUserId: number,
    input: { organizationId?: number }
  ): Promise<{ portalUrl: string }> {
    const subject = await this.resolveSubject(actorUserId, input.organizationId);
    try {
      const session = await this.dependencies.gateway.createCustomerSession({
        externalCustomerId: subject.externalCustomerId,
        returnUrl: new URL("/settings/billing", this.dependencies.webAppUrl).toString(),
      });
      return { portalUrl: session.customerPortalUrl };
    } catch {
      throw providerFailure();
    }
  }

  async changePlan(
    actorUserId: number,
    input: { interval: BillingIntervalType; organizationId?: number; plan: PaidPlanKey }
  ): Promise<void> {
    const subject = await this.resolvePlanSubject(actorUserId, input.plan, input.organizationId);
    const subscriptionId = await this.requireOwnedSubscription(subject);
    const product = getPolarProduct(input.plan, input.interval, this.dependencies.environment);
    await this.updateAndReconcile(subject, {
      id: subscriptionId,
      idempotencyKey: `billing:${subject.subjectKey}:plan:${product.id}`,
      update: { productId: product.id },
    });
  }

  async cancelAtPeriodEnd(actorUserId: number, input: { organizationId?: number }): Promise<void> {
    const subject = await this.resolveSubject(actorUserId, input.organizationId);
    const subscriptionId = await this.requireOwnedSubscription(subject);
    await this.updateAndReconcile(subject, {
      id: subscriptionId,
      idempotencyKey: `billing:${subject.subjectKey}:cancel-at-period-end`,
      update: { cancelAtPeriodEnd: true },
    });
  }

  async reconcile(actorUserId: number, input: { organizationId?: number }): Promise<void> {
    await this.reconcileSubject(await this.resolveSubject(actorUserId, input.organizationId));
  }

  private async resolvePlanSubject(
    actorUserId: number,
    plan: PaidPlanKey,
    organizationId?: number
  ): Promise<BillingSubject> {
    if (plan === "PRO" && organizationId !== undefined) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Pro billing requires a personal subject");
    }
    if (plan === "TEAM" && organizationId === undefined) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Team billing requires an organization subject");
    }
    return this.resolveSubject(actorUserId, organizationId);
  }

  private async resolveSubject(actorUserId: number, organizationId?: number): Promise<BillingSubject> {
    if (organizationId === undefined) return this.dependencies.repository.getUserSubject(actorUserId);
    const subject = await this.dependencies.repository.getOrganizationSubject(actorUserId, organizationId);
    if (subject.actorRole !== "OWNER" && subject.actorRole !== "ADMIN") {
      throw new ErrorWithCode(ErrorCode.Forbidden, "Organization administrator access is required");
    }
    return subject;
  }

  private requireSeats(seats: number): number {
    if (seats >= 1 && seats <= 50) return seats;
    throw new ErrorWithCode(ErrorCode.EntitlementLimitExceeded, "Team seats must be between one and fifty");
  }

  private async requireOwnedSubscription(subject: BillingSubject): Promise<string> {
    const local = await this.dependencies.repository.getBillingSubscription(subject.subjectKey);
    if (!local?.polarSubscriptionId) {
      throw new ErrorWithCode(ErrorCode.EntitlementRequired, "An active Polar subscription is required");
    }
    let providerSubscription: Awaited<ReturnType<PolarBillingGateway["getSubscription"]>>;
    try {
      providerSubscription = await this.dependencies.gateway.getSubscription(local.polarSubscriptionId);
    } catch {
      throw providerFailure();
    }
    if (providerSubscription.externalCustomerId !== subject.externalCustomerId) {
      throw new ErrorWithCode(ErrorCode.Forbidden, "Polar subscription ownership mismatch");
    }
    return providerSubscription.id;
  }

  private async updateAndReconcile(
    subject: BillingSubject,
    update: Parameters<PolarBillingGateway["updateSubscription"]>[0]
  ): Promise<void> {
    try {
      await this.dependencies.gateway.updateSubscription(update);
    } catch {
      throw providerFailure();
    }
    await this.reconcileSubject(subject);
  }

  private async reconcileSubject(subject: BillingSubject): Promise<void> {
    let state: PolarCustomerStateSnapshot;
    try {
      state = await this.dependencies.gateway.getCustomerState(subject.externalCustomerId);
    } catch {
      throw providerFailure();
    }
    await this.dependencies.projection.projectCustomerState(state);
  }
}

export { PolarCheckoutService };
export type { BillingSubjectRepository, PolarCheckoutServiceDependencies };
