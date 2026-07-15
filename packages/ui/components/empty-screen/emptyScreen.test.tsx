import { render, screen } from "@testing-library/react";
import { EmptyScreen } from "./EmptyScreen";

describe("EmptyScreen", () => {
  it("turns absence into a quiet secondary plane", () => {
    render(
      <EmptyScreen Icon="calendar" headline="No bookings" description="New bookings will appear here." />
    );

    expect(screen.getByTestId("empty-screen")).toHaveClass("bg-subtle", "rounded-2xl");
    expect(screen.getByTestId("empty-screen-icon")).toHaveClass("bg-default", "border-subtle");
  });
});
