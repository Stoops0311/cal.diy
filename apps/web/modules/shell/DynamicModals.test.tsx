import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { DynamicModals } from "./DynamicModals";

vi.mock("./hooks/useWelcomeToCalcomModal", () => ({
  useWelcomeToCalcomModal: () => ({ isOpen: true, closeModal: vi.fn() }),
}));

vi.mock("./components/WelcomeToCalcomModal", () => ({
  WelcomeToCalcomModal: () => <div data-testid="welcome-dialog" />,
}));

vi.mock("@calcom/web/modules/settings/components/TimezoneChangeDialog", () => ({
  default: ({ disabled }: { disabled?: boolean }) => (
    <div data-disabled={disabled ? "true" : "false"} data-testid="timezone-dialog" />
  ),
}));

describe("DynamicModals", () => {
  it("gives the welcome prompt priority over the timezone prompt", () => {
    render(<DynamicModals />);

    expect(screen.getByTestId("welcome-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("timezone-dialog")).toHaveAttribute("data-disabled", "true");
  });
});
