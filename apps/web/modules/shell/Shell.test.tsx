import { render } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Mocks = {
  sessionStatus: "authenticated" | "unauthenticated";
};

const mocks: Mocks = vi.hoisted(() => ({
  sessionStatus: "unauthenticated",
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ status: mocks.sessionStatus }),
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ isLocaleReady: true, t: (key: string) => key }),
}));
vi.mock("@calcom/ui/components/errorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-error-boundary">{children}</div>
  ),
}));
vi.mock("@calcom/web/modules/auth/hooks/useRedirectToLoginIfUnauthenticated", () => ({
  useRedirectToLoginIfUnauthenticated: vi.fn(),
}));
vi.mock("@calcom/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded", () => ({
  useRedirectToOnboardingIfNeeded: vi.fn(),
}));
vi.mock("@calcom/web/modules/billing/BillingStatusWidget", () => ({
  BillingStatusWidget: () => <div data-testid="billing-status-widget" />,
}));
vi.mock("@calcom/web/modules/billing/UpgradePromptProvider", () => ({
  UpgradePromptProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="upgrade-prompt-provider">{children}</div>
  ),
}));
vi.mock("@calcom/web/modules/apps/CalendarEntitlementUpgradeBridge", () => ({
  CalendarEntitlementUpgradeBridge: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="calendar-entitlement-bridge">{children}</div>
  ),
}));
vi.mock("@calcom/web/modules/formbricks/hooks/useFormbricks", () => ({ useFormbricks: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("./banners/LayoutBanner", () => ({ BannerContainer: () => null }));
vi.mock("./banners/useBanners", () => ({ useBanners: () => ({ banners: null, bannersHeight: 0 }) }));
vi.mock("./Dock", () => ({ DockContainer: () => <div data-testid="dock" /> }));
vi.mock("./DynamicModals", () => ({ DynamicModals: () => null }));
vi.mock("./Kbar", () => ({
  KBarContent: () => null,
  KBarRoot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./useAppTheme", () => ({ useAppTheme: vi.fn() }));

import Shell from "./Shell";

beforeEach(() => {
  mocks.sessionStatus = "unauthenticated";
});

describe("Shell billing status", () => {
  it("mounts billing status exactly once after authenticated page content and keeps Dock separate", () => {
    const view = render(
      <Shell>
        <div data-testid="page-content" />
      </Shell>
    );

    const pageBoundary = view.getByTestId("page-error-boundary");
    const billingStatus = view.getByTestId("billing-status-widget");

    expect(pageBoundary).toContainElement(view.getByTestId("page-content"));
    expect(pageBoundary).not.toContainElement(billingStatus);
    expect(pageBoundary.compareDocumentPosition(billingStatus)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(view.getAllByTestId("billing-status-widget")).toHaveLength(1);
    expect(view.getByTestId("upgrade-prompt-provider")).toContainElement(billingStatus);
    expect(view.getByTestId("upgrade-prompt-provider")).toContainElement(
      view.getByTestId("calendar-entitlement-bridge")
    );
    expect(view.getByTestId("calendar-entitlement-bridge")).toContainElement(
      view.getByTestId("page-content")
    );
    expect(view.getByTestId("dock")).toBeInTheDocument();
  });

  it("keeps billing status in the authenticated main canvas when withoutMain is set", () => {
    const view = render(
      <Shell withoutMain>
        <div data-testid="page-content" />
      </Shell>
    );

    expect(view.getByTestId("page-error-boundary")).toContainElement(view.getByTestId("page-content"));
    expect(view.getAllByTestId("billing-status-widget")).toHaveLength(1);
  });

  it("does not mount billing status in a public shell even for an authenticated session", () => {
    mocks.sessionStatus = "authenticated";
    const view = render(
      <Shell isPublic>
        <div data-testid="public-content" />
      </Shell>
    );

    expect(view.getByTestId("public-content")).toBeInTheDocument();
    expect(view.queryByTestId("billing-status-widget")).not.toBeInTheDocument();
    expect(view.queryByTestId("upgrade-prompt-provider")).not.toBeInTheDocument();
    expect(view.queryByTestId("calendar-entitlement-bridge")).not.toBeInTheDocument();
    expect(view.getByTestId("dock")).toBeInTheDocument();
  });
});
