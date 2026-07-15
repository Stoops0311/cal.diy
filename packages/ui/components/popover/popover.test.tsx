import { render, screen } from "@testing-library/react";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

describe("Popover", () => {
  it("uses a lifted surface for transient choices", () => {
    render(
      <Popover open>
        <PopoverTrigger>Open choices</PopoverTrigger>
        <PopoverContent>Shared choices</PopoverContent>
      </Popover>
    );

    expect(screen.getByRole("dialog")).toHaveClass("bg-subtle", "rounded-xl", "shadow-dropdown");
  });
});
