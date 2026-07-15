import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaidSelection } from "./PlanSelector";

const mocks = vi.hoisted(() => ({
  checkoutOptions: undefined as { organizationId?: number; returnTo?: string } | undefined,
  pendingPlan: undefined as "PRO" | "TEAM" | undefined,
  push: vi.fn(),
  selectPlan: (_selection: PaidSelection) => {},
  startCheckout: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) =>
      ({
        billing_checkout_error: "Payment did not open. Try again.",
        billing_pricing_description:
          "Choose the way you schedule now. Convenio keeps the handoff to payment brief, then brings you back to the work.",
        billing_pricing_eyebrow: "PLANS FOR THE WORK",
        billing_pricing_title: "One calendar. Or every calendar in the room.",
      })[key] ?? key,
  }),
}));

vi.mock("./usePaidPlanCheckout", () => ({
  usePaidPlanCheckout: (options: { organizationId?: number; returnTo?: string }) => {
    mocks.checkoutOptions = options;
    return {
      pendingPlan: mocks.pendingPlan,
      startCheckout: mocks.startCheckout,
    };
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("../../app/(marketing)/MarketingShell", () => ({
  getMarketingShellCopy: () => ({}),
  MarketingFooter: () => <div data-testid="marketing-footer" />,
  MarketingHeader: () => <div data-testid="marketing-header" />,
}));

vi.mock("@calcom/web/modules/shell/Shell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("./PlanSelector", () => ({
  PlanSelector: (props: { freeHref: string; onSelectPlan(selection: PaidSelection): void }) => {
    mocks.selectPlan = props.onSelectPlan;
    return <div data-testid="plan-selector" data-free-href={props.freeHref} />;
  },
}));

import { Pricing, PricingPage } from "./Pricing";

describe("Pricing", () => {
  beforeEach(() => {
    mocks.checkoutOptions = undefined;
    mocks.pendingPlan = undefined;
    mocks.push.mockClear();
    mocks.startCheckout.mockClear();
    localStorage.clear();
  });

  it("renders marketing for an anonymous visitor", () => {
    const view = render(<Pricing isAuthenticated={false} onSelectPlan={vi.fn()} />);

    expect(view.getByTestId("marketing-header")).toBeInTheDocument();
    expect(view.getByTestId("plan-selector")).toHaveAttribute("data-free-href", "/signup");
    expect(view.getByText("PLANS FOR THE WORK")).toBeInTheDocument();
    expect(
      view.getByRole("heading", { name: "One calendar. Or every calendar in the room." })
    ).toBeInTheDocument();
    expect(
      view.getByText(
        "Choose the way you schedule now. Convenio keeps the handoff to payment brief, then brings you back to the work."
      )
    ).toBeInTheDocument();
  });

  it("renders the native shell for an authenticated visitor", () => {
    const view = render(<Pricing isAuthenticated onSelectPlan={vi.fn()} />);

    expect(view.getByTestId("app-shell")).toBeInTheDocument();
    expect(view.getByTestId("plan-selector")).toHaveAttribute("data-free-href", "/event-types");
  });

  it("preserves intent before sending an anonymous visitor to signup", () => {
    render(<PricingPage isAuthenticated={false} />);

    mocks.selectPlan({ interval: "YEAR", plan: "PRO" });

    expect(localStorage.getItem("onBoardingRedirect")).toBe("/pricing");
    expect(mocks.push).toHaveBeenCalledWith("/signup");
    expect(mocks.startCheckout).not.toHaveBeenCalled();
  });

  it("starts shared checkout for authenticated Pro", () => {
    render(<PricingPage isAuthenticated />);

    mocks.selectPlan({ interval: "YEAR", plan: "PRO" });

    expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });
  });

  it("delegates authenticated Team checkout to the shared controller", () => {
    render(<PricingPage isAuthenticated organizationId={42} />);

    mocks.selectPlan({ interval: "MONTH", plan: "TEAM" });

    expect(mocks.checkoutOptions).toEqual({ organizationId: 42, returnTo: "/pricing" });
    expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "MONTH", plan: "TEAM" });
  });

  it("delegates Team bootstrap to the shared controller", () => {
    render(<PricingPage isAuthenticated />);

    mocks.selectPlan({ interval: "YEAR", plan: "TEAM" });

    expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "TEAM" });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
