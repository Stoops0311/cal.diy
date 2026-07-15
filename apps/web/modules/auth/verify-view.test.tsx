import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import Verify from "./verify-view";

vi.mock("@calcom/lib/hooks/useCompatSearchParams", () => ({
  useCompatSearchParams: () => new URLSearchParams(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) =>
      ({
        invalid_link: "Invalid link",
        invalid_link_description: "Request a new link.",
        back_to_signin: "Back to sign in",
      })[key] ?? key,
  }),
}));

vi.mock("@calcom/lib/hooks/useRouterQuery", () => ({
  useRouterQuery: () => ({}),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/auth/verify",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("Verify", () => {
  it("presents an actionable branded invalid-link state", () => {
    render(<Verify />);

    expect(screen.getByRole("heading", { name: "Invalid link" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/auth/login");
  });
});
