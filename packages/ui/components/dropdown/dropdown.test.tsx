import { render, screen } from "@testing-library/react";
import { Dropdown, DropdownItem, DropdownMenuContent, DropdownMenuTrigger } from "./Dropdown";

describe("Dropdown", () => {
  it("uses the lifted surface and counter-plane hover treatment", () => {
    render(
      <Dropdown open>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownItem>Profile</DropdownItem>
        </DropdownMenuContent>
      </Dropdown>
    );

    expect(screen.getByRole("menu")).toHaveClass("bg-subtle", "rounded-xl", "shadow-dropdown");
    expect(screen.getByRole("button", { name: "Profile" })).toHaveClass("hover:bg-default");
  });
});
