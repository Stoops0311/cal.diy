import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type {
  EntitlementLimits,
  EntitlementSnapshot,
  SubscriptionEntitlementInput,
} from "../lib/entitlements";
import { getEntitlements } from "../lib/entitlements";
import { PlanKey } from "../lib/plans";

type UserEntitlementState = {
  activePersonalEventTypes: number;
  connectedCalendars: number;
  subscriptions: SubscriptionEntitlementInput[];
};
type OrganizationEntitlementState = {
  acceptedOrganizationMembers: number;
  subscription: SubscriptionEntitlementInput | null;
};
type EntitlementRepository = {
  getOrganizationState(organizationId: number): Promise<OrganizationEntitlementState | null>;
  getUserState(userId: number): Promise<UserEntitlementState | null>;
};
type EvaluatedEntitlements = Readonly<
  EntitlementSnapshot & {
    usage: Readonly<EntitlementLimits>;
  }
>;

const subscriptionSelect = {
  cancelAtPeriodEnd: true,
  currentPeriodEnd: true,
  plan: true,
  status: true,
} as const;

class PrismaEntitlementRepository implements EntitlementRepository {
  async getUserState(userId: number): Promise<UserEntitlementState | null> {
    const [user, activePersonalEventTypes, connectedCalendars] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          billingSubscription: { select: subscriptionSelect },
          teams: {
            where: {
              accepted: true,
              team: { archivedAt: null, isOrganization: true },
            },
            select: {
              team: { select: { billingSubscription: { select: subscriptionSelect } } },
            },
          },
        },
      }),
      prisma.eventType.count({ where: { hidden: false, teamId: null, userId } }),
      prisma.credential.count({
        where: {
          app: { categories: { has: "calendar" } },
          invalid: { not: true },
          userId,
        },
      }),
    ]);
    if (!user) return null;

    const subscriptions: SubscriptionEntitlementInput[] = [];
    if (user.billingSubscription) subscriptions.push(user.billingSubscription);
    for (const membership of user.teams) {
      if (membership.team.billingSubscription) subscriptions.push(membership.team.billingSubscription);
    }
    return { activePersonalEventTypes, connectedCalendars, subscriptions };
  }

  async getOrganizationState(organizationId: number): Promise<OrganizationEntitlementState | null> {
    const organization = await prisma.team.findFirst({
      where: { archivedAt: null, id: organizationId, isOrganization: true },
      select: {
        _count: { select: { members: { where: { accepted: true } } } },
        billingSubscription: { select: subscriptionSelect },
      },
    });
    if (!organization) return null;
    return {
      acceptedOrganizationMembers: organization._count.members,
      subscription: organization.billingSubscription,
    };
  }
}

function planRank(plan: EntitlementSnapshot["effectivePlan"]): number {
  if (plan === PlanKey.TEAM) return 2;
  if (plan === PlanKey.PRO) return 1;
  return 0;
}

function freezeSnapshot(snapshot: EntitlementSnapshot, usage: EntitlementLimits): EvaluatedEntitlements {
  return Object.freeze({
    ...snapshot,
    limits: Object.freeze({ ...snapshot.limits }),
    usage: Object.freeze({ ...usage }),
  });
}

class EntitlementService {
  constructor(
    private readonly repository: EntitlementRepository = new PrismaEntitlementRepository(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async forUser(userId: number): Promise<EvaluatedEntitlements> {
    const state = await this.repository.getUserState(userId);
    if (!state) throw new ErrorWithCode(ErrorCode.NotFound, "User entitlements not found");

    let snapshot = getEntitlements(null, this.now());
    for (const subscription of state.subscriptions) {
      const candidate = getEntitlements(subscription, this.now());
      if (planRank(candidate.effectivePlan) > planRank(snapshot.effectivePlan)) snapshot = candidate;
    }
    return freezeSnapshot(snapshot, {
      acceptedOrganizationMembers: 0,
      activePersonalEventTypes: state.activePersonalEventTypes,
      connectedCalendars: state.connectedCalendars,
    });
  }

  async forOrganization(organizationId: number): Promise<EvaluatedEntitlements> {
    const state = await this.repository.getOrganizationState(organizationId);
    if (!state) throw new ErrorWithCode(ErrorCode.NotFound, "Organization entitlements not found");
    return freezeSnapshot(getEntitlements(state.subscription, this.now()), {
      acceptedOrganizationMembers: state.acceptedOrganizationMembers,
      activePersonalEventTypes: 0,
      connectedCalendars: 0,
    });
  }
}

export { EntitlementService };
export type {
  EntitlementRepository,
  EvaluatedEntitlements,
  OrganizationEntitlementState,
  UserEntitlementState,
};
