import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const translated =
        {
          billing_price_cadence_member_monthly: "Per accepted member, billed monthly",
          billing_price_cadence_member_yearly: "Per accepted member, billed yearly",
          billing_price_cadence_monthly: "Billed monthly",
          billing_price_cadence_yearly: "Billed yearly",
          billing_weekly_member_equivalent: "{{price}} per accepted member per week when billed yearly",
        }[key] ?? key;
      return values ? translated.replace("{{price}}", values.price) : translated;
    },
  }),
}));

import { PlanSelector } from "./PlanSelector";

describe("PlanSelector", () => {
  it("starts yearly and shows only the two paid plans", () => {
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

    expect(view.getByRole("button", { name: "billing_interval_yearly" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(view.getByText("$96")).toBeInTheDocument();
    expect(view.getByText("$144")).toBeInTheDocument();
    expect(view.getByText("Billed yearly")).toBeInTheDocument();
    expect(view.getByText("Per accepted member, billed yearly")).toBeInTheDocument();
    expect(view.getByText("$2.77 per accepted member per week when billed yearly")).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "billing_plan_pro" })).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "billing_plan_team" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "billing_plan_free" })).not.toBeInTheDocument();
  });

  it("labels monthly prices and the accepted-member scope from the catalog", () => {
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

    fireEvent.click(view.getByRole("button", { name: "billing_interval_monthly" }));

    expect(view.getByText("$10")).toBeInTheDocument();
    expect(view.getByText("$15")).toBeInTheDocument();
    expect(view.getByText("Billed monthly")).toBeInTheDocument();
    expect(view.getByText("Per accepted member, billed monthly")).toBeInTheDocument();
  });

  it("reveals Free through View all plans", () => {
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

    fireEvent.click(view.getByRole("button", { name: "billing_view_all_plans" }));

    expect(view.getByRole("heading", { name: "billing_plan_free" })).toBeInTheDocument();
    expect(view.getByRole("link", { name: "billing_keep_working_free" })).toHaveAttribute(
      "href",
      "/event-types"
    );
  });

  it("submits action-specific paid selections", () => {
    const onSelectPlan = vi.fn();
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={onSelectPlan} />);

    fireEvent.click(view.getByRole("button", { name: "billing_choose_pro" }));
    expect(onSelectPlan).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });

    fireEvent.click(view.getByRole("button", { name: "billing_interval_monthly" }));
    fireEvent.click(view.getByRole("button", { name: "billing_choose_team" }));
    expect(onSelectPlan).toHaveBeenCalledWith({ interval: "MONTH", plan: "TEAM" });
  });

  it("can present only the required plan without the Free sheet", () => {
    const view = render(
      <PlanSelector
        freeHref="/event-types"
        onSelectPlan={vi.fn()}
        showAllPlans={false}
        visiblePlans={["TEAM"]}
        ctaKeys={{ TEAM: "billing_upgrade_choose_team" }}
      />
    );

    expect(view.getByRole("heading", { name: "billing_plan_team" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "billing_plan_pro" })).not.toBeInTheDocument();
    expect(view.queryByRole("button", { name: "billing_view_all_plans" })).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: "billing_upgrade_choose_team" })).toBeInTheDocument();
  });
});
