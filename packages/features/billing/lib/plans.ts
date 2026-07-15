import {
  BillingInterval,
  type BillingInterval as BillingIntervalType,
  BillingStatus,
  type BillingStatus as BillingStatusType,
  PlanKey,
  type PlanKey as PlanKeyType,
} from "@calcom/prisma/enums";

type PaidPlanKey = Exclude<PlanKeyType, typeof PlanKey.FREE>;

type PlanPrice = {
  amountInCents: number;
  interval: BillingIntervalType;
  perAcceptedMember: boolean;
  trialDays: number;
};

type PaidPlanDefinition = {
  prices: Record<BillingIntervalType, PlanPrice>;
};

const PAID_PLAN_CATALOG = {
  PRO: {
    prices: {
      MONTH: {
        amountInCents: 1_000,
        interval: BillingInterval.MONTH,
        perAcceptedMember: false,
        trialDays: 14,
      },
      YEAR: { amountInCents: 9_600, interval: BillingInterval.YEAR, perAcceptedMember: false, trialDays: 14 },
    },
  },
  TEAM: {
    prices: {
      MONTH: {
        amountInCents: 1_500,
        interval: BillingInterval.MONTH,
        perAcceptedMember: true,
        trialDays: 14,
      },
      YEAR: { amountInCents: 14_400, interval: BillingInterval.YEAR, perAcceptedMember: true, trialDays: 14 },
    },
  },
} as const satisfies Record<PaidPlanKey, PaidPlanDefinition>;

export { BillingInterval, BillingStatus, PAID_PLAN_CATALOG, PlanKey };
export type {
  BillingIntervalType as BillingInterval,
  BillingStatusType as BillingStatus,
  PaidPlanKey,
  PlanKeyType as PlanKey,
};
