import { render, screen } from "@testing-library/react";
import { SettingsToggle } from "./SettingsToggle";

describe("SettingsToggle", () => {
  it("uses a raised plane when the control is presented as a settings card", () => {
    render(
      <SettingsToggle title="Public profile" description="Allow indexing" checked toggleSwitchAtTheEnd />
    );

    const card = screen.getByText("Public profile").closest("fieldset")?.firstElementChild;
    expect(card).toHaveClass("bg-subtle", "rounded-xl");
  });
});
