"use client";

import { useCurrentSession } from "@calcom/features/auth/lib/useCurrentSession";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@calcom/ui/components/sheet";
import type React from "react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { PlanSelector } from "./PlanSelector";
import type { UpgradeCapability, UpgradeResume } from "./upgradeIntent";
import { saveUpgradeIntent } from "./upgradeIntent";
import { usePaidPlanCheckout } from "./usePaidPlanCheckout";

export type OpenUpgradePromptInput = {
  capability: UpgradeCapability;
  description?: string;
  featureName: string;
  organizationId?: number;
  requiredPlan: "PRO" | "TEAM";
  returnTo: string;
  resume: UpgradeResume;
};

type UpgradePromptContextValue = {
  openUpgradePrompt(input: OpenUpgradePromptInput): void;
};

const UpgradePromptContext = createContext<UpgradePromptContextValue>({
  openUpgradePrompt: () => {
    throw new Error("useUpgradePrompt must be used within UpgradePromptProvider");
  },
});

function getRequestedOrganizationId(input: OpenUpgradePromptInput): number | undefined {
  if (input.capability === "organizationInvitations" && input.resume.kind === "openOrganizationInvitations") {
    return input.resume.organizationId;
  }
  return input.organizationId;
}

export function useUpgradePrompt(): UpgradePromptContextValue {
  return useContext(UpgradePromptContext);
}

export function UpgradePromptProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { t } = useLocale();
  const { data: session } = useCurrentSession();
  const [prompt, setPrompt] = useState<OpenUpgradePromptInput | null>(null);
  const promptTriggerRef = useRef<HTMLElement | null>(null);
  const organization = session?.user.org;
  const manageableOrganizationId =
    organization?.role === "OWNER" || organization?.role === "ADMIN" ? organization.id : undefined;
  const organizationId =
    prompt?.requiredPlan === "TEAM" && prompt.capability !== "bookingAudit"
      ? getRequestedOrganizationId(prompt)
      : manageableOrganizationId;
  const paidCheckout = usePaidPlanCheckout({
    organizationId,
    returnTo: prompt?.returnTo ?? "/pricing",
    onBeforeNavigate: ({ organizationId: checkoutOrganizationId, selection }) => {
      if (!prompt) return;
      saveUpgradeIntent(
        {
          capability: prompt.capability,
          requiredPlan: prompt.requiredPlan,
          returnTo: prompt.returnTo,
          resume: prompt.resume,
        },
        {
          subject: checkoutOrganizationId
            ? { kind: "organization", organizationId: checkoutOrganizationId }
            : selection.plan === "PRO"
              ? { kind: "user" }
              : undefined,
        }
      );
    },
  });
  const openUpgradePrompt = useCallback(
    (input: OpenUpgradePromptInput) => {
      if (
        input.requiredPlan === "TEAM" &&
        input.capability !== "bookingAudit" &&
        getRequestedOrganizationId(input) !== manageableOrganizationId
      ) {
        return;
      }
      if (document.activeElement instanceof HTMLElement) promptTriggerRef.current = document.activeElement;
      setPrompt(input);
    },
    [manageableOrganizationId]
  );
  const planName = prompt ? t(prompt.requiredPlan === "TEAM" ? "billing_plan_team" : "billing_plan_pro") : "";

  return (
    <UpgradePromptContext.Provider value={{ openUpgradePrompt }}>
      {children}
      <Sheet open={prompt !== null} onOpenChange={(open) => !open && setPrompt(null)}>
        <SheetContent
          className="[@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            promptTriggerRef.current?.focus();
            promptTriggerRef.current = null;
          }}>
          <SheetHeader>
            <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">
              {prompt?.requiredPlan === "TEAM" ? t("billing_plan_team") : t("billing_plan_pro")}
            </p>
            <SheetTitle>
              {prompt ? t("billing_upgrade_title", { feature: prompt.featureName, plan: planName }) : ""}
            </SheetTitle>
            <SheetDescription>
              {prompt?.description ??
                (prompt?.capability === "bookingAudit" ? t("billing_upgrade_booking_audit_description") : "")}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {prompt ? (
              <PlanSelector
                ctaKeys={{
                  [prompt.requiredPlan]:
                    prompt.requiredPlan === "TEAM"
                      ? "billing_upgrade_choose_team"
                      : "billing_upgrade_choose_pro",
                }}
                freeHref={prompt.returnTo}
                onSelectPlan={paidCheckout.startCheckout}
                pendingPlan={paidCheckout.pendingPlan}
                showAllPlans={false}
                visiblePlans={[prompt.requiredPlan]}
              />
            ) : null}
            <Button color="minimal" className="mt-4 w-full justify-center" onClick={() => setPrompt(null)}>
              {t("billing_upgrade_not_now")}
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </UpgradePromptContext.Provider>
  );
}
