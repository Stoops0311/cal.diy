"use client";

import { EntitlementUpgradeBridgeProvider } from "@calcom/app-store/_utils/EntitlementUpgradeBridge";
import { useCurrentSession } from "@calcom/features/auth/lib/useCurrentSession";
import type { EntitlementDenial } from "@calcom/features/billing/lib/entitlementDenial";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { useEntitlementUpgrade } from "../billing/useEntitlementUpgrade";

export function CalendarEntitlementUpgradeBridge({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useCurrentSession();
  const { openFromDenial } = useEntitlementUpgrade();
  const serializedSearchParams = searchParams?.toString() ?? "";
  const organization = session?.user.org;
  const manageableOrganizationId =
    organization?.role === "OWNER" || organization?.role === "ADMIN" ? organization.id : undefined;

  const onEntitlementDenied = useCallback(
    (denial: EntitlementDenial) => {
      if (denial.kind !== "limit" || denial.resource !== "connectedCalendars") return;
      if (organization && manageableOrganizationId === undefined) return;

      const returnPath = pathname ?? "/apps";
      const returnTo = serializedSearchParams ? `${returnPath}?${serializedSearchParams}` : returnPath;

      openFromDenial(denial, {
        ...(manageableOrganizationId ? { organizationId: manageableOrganizationId } : {}),
        returnTo,
      });
    },
    [manageableOrganizationId, openFromDenial, organization, pathname, serializedSearchParams]
  );

  return (
    <EntitlementUpgradeBridgeProvider onEntitlementDenied={onEntitlementDenied}>
      {children}
    </EntitlementUpgradeBridgeProvider>
  );
}
