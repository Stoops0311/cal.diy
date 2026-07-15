import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaidSelection } from "./PlanSelector";

const mocks = vi.hoisted(() => ({
  checkoutMutate: vi.fn(),
  push: vi.fn(),
  selectPlan: (_selection: PaidSelection) => {},
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      billing: {
        createCheckout: {
          useMutation: () => ({
            isPending: false,
            mutate: mocks.checkoutMutate,
            variables: undefined,
          }),
        },
      },
    },
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
    mocks.checkoutMutate.mockClear();
    mocks.push.mockClear();
    localStorage.clear();
  });

  it("renders marketing for an anonymous visitor", () => {
    const view = render(<Pricing isAuthenticated={false} onSelectPlan={vi.fn()} />);

    expect(view.getByTestId("marketing-header")).toBeInTheDocument();
    expect(view.getByTestId("plan-selector")).toHaveAttribute("data-free-href", "/signup");
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
    expect(mocks.checkoutMutate).not.toHaveBeenCalled();
  });

  it("keeps Pro on the existing authenticated checkout mutation", () => {
    render(<PricingPage isAuthenticated />);

    mocks.selectPlan({ interval: "YEAR", plan: "PRO" });

    expect(mocks.checkoutMutate).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });
  });

  it("includes the organization for an authenticated Team checkout", () => {
    render(<PricingPage isAuthenticated organizationId={42} />);

    mocks.selectPlan({ interval: "MONTH", plan: "TEAM" });

    expect(mocks.checkoutMutate).toHaveBeenCalledWith({
      interval: "MONTH",
      organizationId: 42,
      plan: "TEAM",
    });
  });

  it("keeps the existing organization bootstrap URL when Team has no organization", () => {
    render(<PricingPage isAuthenticated />);

    mocks.selectPlan({ interval: "YEAR", plan: "TEAM" });

    expect(mocks.push).toHaveBeenCalledWith("/settings/organizations/new?returnTo=%2Fpricing&interval=YEAR");
    expect(mocks.checkoutMutate).not.toHaveBeenCalled();
  });
});
