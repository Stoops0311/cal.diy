"use client";

import { useCurrentSession } from "@calcom/features/auth/lib/useCurrentSession";
import {
  type EntitlementDenial,
  parseEntitlementDenial,
} from "@calcom/features/billing/lib/entitlementDenial";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useUpgradePrompt } from "./UpgradePromptProvider";
import type { ContextualUpgradeCapability } from "./upgradeIntent";
import { normalizeRelativePath } from "./upgradeIntent";

type EntitlementUpgradeContext = {
  returnTo: string;
  teamId?: number;
  organizationId?: number;
};

const gateCopy = {
  activePersonalEventTypes: "active_personal_event_types",
  canCreateApiKeys: "create_api_keys",
  canCreateTeamEvents: "create_team_events",
  canCreateWebhooks: "create_webhooks",
  canRemoveBranding: "remove_branding",
  canUseAdvancedEvents: "use_advanced_events",
  canUseBookingPayments: "use_booking_payments",
  canUseCollectiveScheduling: "use_collective_scheduling",
  canUseCustomBookingFields: "use_custom_booking_fields",
  canUseCustomRedirects: "use_custom_redirects",
  canUsePrivateLinks: "use_private_links",
  canUseRecurringEvents: "use_recurring_events",
  canUseRoundRobinScheduling: "use_round_robin_scheduling",
  connectedCalendars: "connected_calendars",
} as const satisfies Record<ContextualUpgradeCapability, string>;

const teamOnlyCapabilities = new Set<ContextualUpgradeCapability>([
  "canCreateTeamEvents",
  "canUseCollectiveScheduling",
  "canUseRoundRobinScheduling",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidOptionalId(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value > 0);
}

export function useEntitlementUpgrade(): {
  openFromError(error: unknown, context: EntitlementUpgradeContext): boolean;
  openFromDenial(denial: EntitlementDenial, context: EntitlementUpgradeContext): boolean;
} {
  const { t } = useLocale();
  const { data: session } = useCurrentSession();
  const { openUpgradePrompt } = useUpgradePrompt();
  const openFromDenial = (denial: EntitlementDenial, context: EntitlementUpgradeContext): boolean => {
    const capability = denial.kind === "capability" ? denial.capability : denial.resource;
    if (!Object.hasOwn(gateCopy, capability)) return false;
    if (!isValidOptionalId(context.teamId) || !isValidOptionalId(context.organizationId)) return false;

    const returnTo = normalizeRelativePath(context.returnTo);
    if (!returnTo) return false;
    const gate = capability as ContextualUpgradeCapability;
    const teamScoped = context.teamId !== undefined || context.organizationId !== undefined;
    if (teamOnlyCapabilities.has(gate) && !teamScoped) return false;
    const organization = session?.user.org;
    const manageableOrganizationId =
      organization?.role === "OWNER" || organization?.role === "ADMIN" ? organization.id : undefined;
    if (teamScoped && context.organizationId === undefined) return false;
    if (context.organizationId !== undefined && context.organizationId !== manageableOrganizationId)
      return false;
    const copyKey = gateCopy[gate];

    openUpgradePrompt({
      capability: gate,
      description: t(`billing_upgrade_${copyKey}_description`),
      featureName: t(`billing_upgrade_${copyKey}_feature`),
      ...(teamScoped ? { organizationId: context.organizationId } : {}),
      requiredPlan: teamScoped ? "TEAM" : "PRO",
      resume: { kind: "returnToFeature" },
      returnTo,
    });
    return true;
  };
  const openFromError = (error: unknown, context: EntitlementUpgradeContext): boolean => {
    if (!isRecord(error) || !isRecord(error.data)) return false;
    const denial = parseEntitlementDenial(error.data.entitlement);
    return denial ? openFromDenial(denial, context) : false;
  };

  return { openFromDenial, openFromError };
}

export type { EntitlementUpgradeContext };
