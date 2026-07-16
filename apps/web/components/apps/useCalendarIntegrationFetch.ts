"use client";

import { useEntitlementDeniedHandler } from "@calcom/app-store/_utils/EntitlementUpgradeBridge";
import { parseEntitlementDenial } from "@calcom/features/billing/lib/entitlementDenial";
import { useCallback } from "react";

export function useCalendarIntegrationFetch(): (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response> {
  const onEntitlementDenied = useEntitlementDeniedHandler();

  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await fetch(input, init);
      if (response.ok) return response;

      try {
        const body: unknown = await response.clone().json();
        if (typeof body !== "object" || body === null || Array.isArray(body)) return response;
        let entitlement: unknown;
        if ("entitlement" in body) entitlement = body.entitlement;
        const denial = parseEntitlementDenial(entitlement);
        if (denial?.kind === "limit" && denial.resource === "connectedCalendars") {
          onEntitlementDenied?.(denial);
        }
      } catch {
        return response;
      }

      return response;
    },
    [onEntitlementDenied]
  );
}
