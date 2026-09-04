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
  organizationIdCandidate?: number;
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
  openFromError(error: unknown, context: EntitlementUpgradeContext, trigger?: HTMLElement): boolean;
  openFromDenial(
    denial: EntitlementDenial,
    context: EntitlementUpgradeContext,
    trigger?: HTMLElement
  ): boolean;
} {
  const { t } = useLocale();
  const { data: session } = useCurrentSession();
  const { openUpgradePrompt } = useUpgradePrompt();
  const openFromDenial = (
    denial: EntitlementDenial,
    context: EntitlementUpgradeContext,
    trigger?: HTMLElement
  ): boolean => {
    const capability = denial.kind === "capability" ? denial.capability : denial.resource;
    if (!Object.hasOwn(gateCopy, capability)) return false;
    if (
      !isValidOptionalId(context.teamId) ||
      !isValidOptionalId(context.organizationId) ||
      !isValidOptionalId(context.organizationIdCandidate)
    )
      return false;
    if (
      context.organizationId !== undefined &&
      context.organizationIdCandidate !== undefined &&
      context.organizationId !== context.organizationIdCandidate
    )
      return false;

    const returnTo = normalizeRelativePath(context.returnTo);
    if (!returnTo) return false;
    const gate = capability as ContextualUpgradeCapability;
    const requestedOrganizationId = context.organizationId ?? context.organizationIdCandidate;
    const teamScoped = context.teamId !== undefined || requestedOrganizationId !== undefined;
    if (teamOnlyCapabilities.has(gate) && !teamScoped) return false;
    const organization = session?.user.org;
    const manageableOrganizationId =
      organization?.role === "OWNER" || organization?.role === "ADMIN" ? organization.id : undefined;
    if (teamScoped && requestedOrganizationId === undefined) return false;
    if (requestedOrganizationId !== undefined) {
      if (organization && requestedOrganizationId !== manageableOrganizationId) return false;
      if (!organization && context.organizationIdCandidate === undefined) return false;
    }
    const copyKey = gateCopy[gate];

    const prompt = {
      capability: gate,
      description: t(`billing_upgrade_${copyKey}_description`),
      featureName: t(`billing_upgrade_${copyKey}_feature`),
      ...(teamScoped ? { organizationId: requestedOrganizationId } : {}),
      requiredPlan: teamScoped ? "TEAM" : "PRO",
      resume: { kind: "returnToFeature" },
      returnTo,
    } as const;
    if (trigger) openUpgradePrompt(prompt, trigger);
    else openUpgradePrompt(prompt);
    return true;
  };
  const openFromError = (
    error: unknown,
    context: EntitlementUpgradeContext,
    trigger?: HTMLElement
  ): boolean => {
    if (!isRecord(error) || !isRecord(error.data)) return false;
    const denial = parseEntitlementDenial(error.data.entitlement);
    return denial ? openFromDenial(denial, context, trigger) : false;
  };

  return { openFromDenial, openFromError };
}

export type { EntitlementUpgradeContext };
