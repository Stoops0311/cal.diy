import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import MaintenancePage from "./maintenance-view";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => ({ under_maintenance: "Down for maintenance" })[key] ?? key,
  }),
}));

describe("MaintenancePage", () => {
  it("uses opposing planes for the service message and support action", () => {
    render(<MaintenancePage />);

    expect(screen.getByRole("heading", { name: "Down for maintenance" }).parentElement).toHaveClass(
      "bg-subtle",
      "rounded-2xl",
      "border"
    );
  });
});
