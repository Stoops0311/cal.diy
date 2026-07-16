import {
  type EntitlementDeniedContext,
  useEntitlementDeniedHandler,
} from "@calcom/app-store/_utils/EntitlementUpgradeBridge";
import type { EntitlementDenial } from "@calcom/features/billing/lib/entitlementDenial";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const copy = {
  billing_upgrade_connected_calendars_description:
    "Check every calendar that can change whether a time holds.",
  billing_upgrade_connected_calendars_feature: "Another calendar",
} as const;

const mocks = vi.hoisted(() => ({
  openUpgradePrompt: vi.fn(),
  pathname: "/apps",
  searchParams: new URLSearchParams("category=calendar"),
  session: { user: {} } as {
    user: { org?: { id: number; role: "OWNER" | "ADMIN" | "MEMBER" } };
  },
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: mocks.session }),
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => copy[key as keyof typeof copy] ?? key }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("../billing/UpgradePromptProvider", () => ({
  useUpgradePrompt: () => ({ openUpgradePrompt: mocks.openUpgradePrompt }),
}));

import { CalendarEntitlementUpgradeBridge } from "./CalendarEntitlementUpgradeBridge";

const connectedCalendarsDenial: EntitlementDenial = {
  currentCount: 1,
  effectivePlan: "FREE",
  kind: "limit",
  limit: 1,
  resource: "connectedCalendars",
};

function DenialTrigger({
  context,
  denial,
}: {
  context?: EntitlementDeniedContext;
  denial: EntitlementDenial;
}) {
  const onEntitlementDenied = useEntitlementDeniedHandler();
  return (
    <button type="button" onClick={() => onEntitlementDenied?.(denial, context)}>
      deny calendar
    </button>
  );
}

function renderBridge(
  denial: EntitlementDenial = connectedCalendarsDenial,
  context?: EntitlementDeniedContext
) {
  render(
    <CalendarEntitlementUpgradeBridge>
      <DenialTrigger context={context} denial={denial} />
    </CalendarEntitlementUpgradeBridge>
  );
  fireEvent.click(screen.getByRole("button", { name: "deny calendar" }));
}

describe("CalendarEntitlementUpgradeBridge", () => {
  beforeEach(() => {
    mocks.openUpgradePrompt.mockReset();
    mocks.pathname = "/apps";
    mocks.searchParams = new URLSearchParams("category=calendar");
    mocks.session = { user: {} };
  });

  it("opens exact Pro copy and returns to the current app page", () => {
    renderBridge();

    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith({
      capability: "connectedCalendars",
      description: "Check every calendar that can change whether a time holds.",
      featureName: "Another calendar",
      requiredPlan: "PRO",
      resume: { kind: "returnToFeature" },
      returnTo: "/apps?category=calendar",
    });
  });

  it("opens exact Team copy only for the accepted organization route", () => {
    mocks.pathname = "/apps/installation/accounts";
    mocks.searchParams = new URLSearchParams("slug=google-calendar");
    mocks.session = { user: { org: { id: 41, role: "ADMIN" } } };

    renderBridge();

    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith({
      capability: "connectedCalendars",
      description: "Check every calendar that can change whether a time holds.",
      featureName: "Another calendar",
      organizationId: 41,
      requiredPlan: "TEAM",
      resume: { kind: "returnToFeature" },
      returnTo: "/apps/installation/accounts?slug=google-calendar",
    });
  });

  it("keeps a Clerk-shaped explicit organization action in Team for server authorization", () => {
    mocks.pathname = "/apps/installation/accounts";
    mocks.searchParams = new URLSearchParams("slug=google-calendar");

    renderBridge(connectedCalendarsDenial, { organizationIdCandidate: 77 });

    expect(mocks.openUpgradePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "connectedCalendars",
        organizationId: 77,
        requiredPlan: "TEAM",
        returnTo: "/apps/installation/accounts?slug=google-calendar",
      })
    );
  });

  it("rejects an explicit action that mismatches the session organization", () => {
    mocks.session = { user: { org: { id: 41, role: "OWNER" } } };

    renderBridge(connectedCalendarsDenial, { organizationIdCandidate: 77 });

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
  });

  it("rejects invalid explicit organization candidates", () => {
    renderBridge(connectedCalendarsDenial, { organizationIdCandidate: 0 });

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
  });

  it("ignores denials outside the calendar connection allowlist", () => {
    renderBridge({
      capability: "canCreateWebhooks",
      effectivePlan: "FREE",
      kind: "capability",
    });

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
  });

  it("does not turn an accepted ordinary member denial into personal Pro", () => {
    mocks.session = { user: { org: { id: 41, role: "MEMBER" } } };

    renderBridge(connectedCalendarsDenial, { organizationIdCandidate: 41 });

    expect(mocks.openUpgradePrompt).not.toHaveBeenCalled();
  });
});
