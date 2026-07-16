import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { EntitlementCapability, EntitlementLimit } from "./entitlements";
import { PLAN_ENTITLEMENTS } from "./entitlements";
import type { PlanKeyType } from "./plans";
import { PlanKey } from "./plans";

type EntitlementDenial =
  | {
      kind: "capability";
      capability: EntitlementCapability;
      effectivePlan: PlanKeyType;
    }
  | {
      kind: "limit";
      resource: EntitlementLimit;
      currentCount: number;
      limit: number;
      effectivePlan: PlanKeyType;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isPlan(value: unknown): value is PlanKeyType {
  return typeof value === "string" && Object.values(PlanKey).includes(value as PlanKeyType);
}

function isCapability(value: unknown): value is EntitlementCapability {
  return (
    typeof value === "string" &&
    Object.hasOwn(PLAN_ENTITLEMENTS.FREE, value) &&
    typeof PLAN_ENTITLEMENTS.FREE[value as keyof typeof PLAN_ENTITLEMENTS.FREE] === "boolean"
  );
}

function isLimit(value: unknown): value is EntitlementLimit {
  return (
    typeof value === "string" &&
    Object.hasOwn(PLAN_ENTITLEMENTS.FREE, value) &&
    typeof PLAN_ENTITLEMENTS.FREE[value as keyof typeof PLAN_ENTITLEMENTS.FREE] === "number"
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseEntitlementDenial(value: unknown): EntitlementDenial | null {
  if (!isRecord(value) || !isPlan(value.effectivePlan)) return null;

  if (
    value.kind === "capability" &&
    hasExactKeys(value, ["kind", "capability", "effectivePlan"]) &&
    isCapability(value.capability)
  ) {
    return {
      kind: "capability",
      capability: value.capability,
      effectivePlan: value.effectivePlan,
    };
  }

  if (
    value.kind === "limit" &&
    hasExactKeys(value, ["kind", "resource", "currentCount", "limit", "effectivePlan"]) &&
    isLimit(value.resource) &&
    isCount(value.currentCount) &&
    isCount(value.limit)
  ) {
    return {
      kind: "limit",
      resource: value.resource,
      currentCount: value.currentCount,
      limit: value.limit,
      effectivePlan: value.effectivePlan,
    };
  }

  return null;
}

export function getEntitlementDenialFromError(error: unknown): EntitlementDenial | null {
  if (!(error instanceof ErrorWithCode) || !isRecord(error.data)) return null;

  if (error.code === ErrorCode.EntitlementRequired) {
    if (!hasExactKeys(error.data, ["capability", "effectivePlan"])) return null;
    return parseEntitlementDenial({
      kind: "capability",
      capability: error.data.capability,
      effectivePlan: error.data.effectivePlan,
    });
  }

  if (error.code === ErrorCode.EntitlementLimitExceeded) {
    if (!hasExactKeys(error.data, ["currentCount", "effectivePlan", "limit", "resource"])) return null;
    return parseEntitlementDenial({
      kind: "limit",
      currentCount: error.data.currentCount,
      effectivePlan: error.data.effectivePlan,
      limit: error.data.limit,
      resource: error.data.resource,
    });
  }

  return null;
}

export type { EntitlementDenial };
