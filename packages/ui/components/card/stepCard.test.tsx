import { render, screen } from "@testing-library/react";
import { StepCard } from "./StepCard";

describe("StepCard", () => {
  it("lifts each onboarding step above its surrounding plane", () => {
    render(<StepCard>Choose a calendar</StepCard>);

    expect(screen.getByText("Choose a calendar")).toHaveClass("bg-subtle", "border-subtle", "rounded-2xl");
  });
});
