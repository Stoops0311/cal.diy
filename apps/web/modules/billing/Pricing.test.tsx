import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

import { Pricing } from "./Pricing";

describe("Pricing", () => {
  it("shows all plans and switches to exact annual prices", () => {
    const view = render(<Pricing isAuthenticated onSelectPlan={vi.fn()} />);

    expect(view.getByRole("heading", { name: "billing_plan_free" })).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "billing_plan_pro" })).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "billing_plan_team" })).toBeInTheDocument();
    expect(view.getByText("$10")).toBeInTheDocument();
    expect(view.getByText("$15")).toBeInTheDocument();

    fireEvent.click(view.getByRole("button", { name: "billing_interval_yearly" }));

    expect(view.getByText("$96")).toBeInTheDocument();
    expect(view.getByText("$144")).toBeInTheDocument();
  });

  it("routes paid selections through the supplied checkout boundary", () => {
    const onSelectPlan = vi.fn();
    const view = render(<Pricing isAuthenticated onSelectPlan={onSelectPlan} />);

    fireEvent.click(view.getByRole("button", { name: "billing_choose_pro" }));
    expect(onSelectPlan).toHaveBeenCalledWith({ interval: "MONTH", plan: "PRO" });

    fireEvent.click(view.getByRole("button", { name: "billing_interval_yearly" }));
    fireEvent.click(view.getByRole("button", { name: "billing_choose_team" }));
    expect(onSelectPlan).toHaveBeenCalledWith({ interval: "YEAR", plan: "TEAM" });
  });
});
