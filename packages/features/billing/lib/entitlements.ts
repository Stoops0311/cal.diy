import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { BillingStatus, type BillingStatusType, PlanKey, type PlanKeyType } from "./plans";

type EntitlementLimits = {
  acceptedOrganizationMembers: number;
  activePersonalEventTypes: number;
  connectedCalendars: number;
};

type CapabilityEntitlements = {
  canCreateApiKeys: boolean;
  canCreateTeamEvents: boolean;
  canCreateWebhooks: boolean;
  canInviteOrganizationMembers: boolean;
  canManageOrganizationRoles: boolean;
  canManageOrganizations: boolean;
  canReadBookingAudit: boolean;
  canRemoveBranding: boolean;
  canUseAdvancedEvents: boolean;
  canUseBookingPayments: boolean;
  canUseCollectiveScheduling: boolean;
  canUseCustomBookingFields: boolean;
  canUseCustomRedirects: boolean;
  canUsePrivateLinks: boolean;
  canUseRecurringEvents: boolean;
  canUseRoundRobinScheduling: boolean;
};

type PlanEntitlements = CapabilityEntitlements & EntitlementLimits;
type EntitlementCapability = keyof CapabilityEntitlements;
type EntitlementLimit = keyof EntitlementLimits;

type SubscriptionEntitlementInput = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  plan: PlanKeyType;
  status: BillingStatusType;
};

type EntitlementSnapshot = CapabilityEntitlements & {
  effectivePlan: PlanKeyType;
  limits: EntitlementLimits;
  showBranding: boolean;
  subscriptionStatus: BillingStatusType;
};

const noPaidCapabilities = {
  canCreateApiKeys: false,
  canCreateTeamEvents: false,
  canCreateWebhooks: false,
  canInviteOrganizationMembers: false,
  canManageOrganizationRoles: false,
  canManageOrganizations: false,
  canReadBookingAudit: false,
  canRemoveBranding: false,
  canUseAdvancedEvents: false,
  canUseBookingPayments: false,
  canUseCollectiveScheduling: false,
  canUseCustomBookingFields: false,
  canUseCustomRedirects: false,
  canUsePrivateLinks: false,
  canUseRecurringEvents: false,
  canUseRoundRobinScheduling: false,
} as const satisfies CapabilityEntitlements;

const allPersonalCapabilities = {
  ...noPaidCapabilities,
  canCreateApiKeys: true,
  canCreateWebhooks: true,
  canRemoveBranding: true,
  canUseAdvancedEvents: true,
  canUseBookingPayments: true,
  canUseCustomBookingFields: true,
  canUseCustomRedirects: true,
  canUsePrivateLinks: true,
  canUseRecurringEvents: true,
} as const satisfies CapabilityEntitlements;

const PLAN_ENTITLEMENTS = {
  FREE: {
    ...noPaidCapabilities,
    acceptedOrganizationMembers: 0,
    activePersonalEventTypes: 2,
    connectedCalendars: 1,
  },
  PRO: {
    ...allPersonalCapabilities,
    acceptedOrganizationMembers: 0,
    activePersonalEventTypes: Number.POSITIVE_INFINITY,
    connectedCalendars: Number.POSITIVE_INFINITY,
  },
  TEAM: {
    ...allPersonalCapabilities,
    acceptedOrganizationMembers: 50,
    activePersonalEventTypes: Number.POSITIVE_INFINITY,
    canCreateTeamEvents: true,
    canInviteOrganizationMembers: true,
    canManageOrganizationRoles: true,
    canManageOrganizations: true,
    canReadBookingAudit: true,
    canUseCollectiveScheduling: true,
    canUseRoundRobinScheduling: true,
    connectedCalendars: Number.POSITIVE_INFINITY,
  },
} as const satisfies Record<PlanKeyType, PlanEntitlements>;

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;

function hasPaidAccess(subscription: SubscriptionEntitlementInput, now: Date): boolean {
  if (subscription.status === BillingStatus.ACTIVE || subscription.status === BillingStatus.TRIALING) {
    return true;
  }

  if (subscription.status === BillingStatus.CANCELED) {
    return (
      subscription.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd.getTime() >= now.getTime()
    );
  }

  if (subscription.status === BillingStatus.PAST_DUE && subscription.currentPeriodEnd !== null) {
    return subscription.currentPeriodEnd.getTime() + PAST_DUE_GRACE_MS >= now.getTime();
  }

  return false;
}

function getEntitlements(
  subscription: SubscriptionEntitlementInput | null,
  now: Date = new Date()
): EntitlementSnapshot {
  const effectivePlan = subscription && hasPaidAccess(subscription, now) ? subscription.plan : PlanKey.FREE;
  const planEntitlements = PLAN_ENTITLEMENTS[effectivePlan];
  const { acceptedOrganizationMembers, activePersonalEventTypes, connectedCalendars, ...capabilities } =
    planEntitlements;

  return {
    ...capabilities,
    effectivePlan,
    limits: { acceptedOrganizationMembers, activePersonalEventTypes, connectedCalendars },
    showBranding: !capabilities.canRemoveBranding,
    subscriptionStatus: subscription?.status ?? BillingStatus.NONE,
  };
}

function assertEntitled(snapshot: EntitlementSnapshot, capability: EntitlementCapability): void {
  if (snapshot[capability]) return;

  throw new ErrorWithCode(ErrorCode.EntitlementRequired, "This capability requires a paid plan", {
    capability,
    effectivePlan: snapshot.effectivePlan,
  });
}

function assertWithinLimit(
  snapshot: EntitlementSnapshot,
  resource: EntitlementLimit,
  currentCount: number
): void {
  const limit = snapshot.limits[resource];
  if (currentCount < limit) return;

  throw new ErrorWithCode(ErrorCode.EntitlementLimitExceeded, "This plan's resource limit was reached", {
    currentCount,
    effectivePlan: snapshot.effectivePlan,
    limit,
    resource,
  });
}

export { assertEntitled, assertWithinLimit, getEntitlements, PLAN_ENTITLEMENTS };
export type {
  CapabilityEntitlements,
  EntitlementCapability,
  EntitlementLimit,
  EntitlementLimits,
  EntitlementSnapshot,
  PlanEntitlements,
  SubscriptionEntitlementInput,
};
