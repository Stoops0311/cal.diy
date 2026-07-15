import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanInactive } from "./Unavailable";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

describe("PlanInactive", () => {
  it("renders a stable plan-inactive state for Team booking pages", () => {
    render(<PlanInactive />);

    expect(screen.getByTestId("team-plan-inactive")).toBeInTheDocument();
    expect(screen.getByText("team_booking_plan_inactive_title")).toBeInTheDocument();
    expect(screen.getByText("team_booking_plan_inactive_description")).toBeInTheDocument();
  });
});
