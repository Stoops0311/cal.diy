import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? key + ":" + Object.values(values).join(":") : key,
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
    expect(view.getByRole("heading", { name: "billing_plan_pro" })).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "billing_plan_team" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "billing_plan_free" })).not.toBeInTheDocument();
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
});
