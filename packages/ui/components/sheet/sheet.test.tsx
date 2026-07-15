import { render, screen } from "@testing-library/react";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "./Sheet";

describe("Sheet", () => {
  it("uses a lifted surface and a contrasting action plane", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Booking details</SheetTitle>
          <SheetFooter>Actions</SheetFooter>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByRole("dialog")).toHaveClass("bg-subtle", "rounded-2xl", "overscroll-contain");
    expect(screen.getByTestId("sheet-footer")).toHaveClass("bg-default", "border-t");
  });

  it("uses the display face for the sheet title", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Booking details</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByText("Booking details")).toHaveClass("font-cal");
  });

  it("names the icon-only close control", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Booking details</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });
});
