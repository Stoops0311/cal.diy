"use client";

import type { EntitlementDenial } from "@calcom/features/billing/lib/entitlementDenial";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

type EntitlementDeniedContext = {
  organizationIdCandidate?: number;
};

type EntitlementDeniedHandler = (denial: EntitlementDenial, context?: EntitlementDeniedContext) => void;

const EntitlementUpgradeBridgeContext = createContext<EntitlementDeniedHandler | undefined>(undefined);

export function EntitlementUpgradeBridgeProvider({
  children,
  onEntitlementDenied,
}: {
  onEntitlementDenied: EntitlementDeniedHandler;
  children: ReactNode;
}): React.ReactElement {
  return (
    <EntitlementUpgradeBridgeContext.Provider value={onEntitlementDenied}>
      {children}
    </EntitlementUpgradeBridgeContext.Provider>
  );
}

export function useEntitlementDeniedHandler(): EntitlementDeniedHandler | undefined {
  return useContext(EntitlementUpgradeBridgeContext);
}

export type { EntitlementDeniedContext, EntitlementDeniedHandler };
