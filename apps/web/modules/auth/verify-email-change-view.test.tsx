import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import VerifyEmailChange from "./verify-email-change-view";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: vi.fn() }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    isLocaleReady: true,
    t: (key: string) =>
      ({
        verify_email_change_failure_title: "Couldn’t confirm your email",
        verify_email_change_failure_description: "Request a new link from profile settings.",
        return_to_settings: "Return to settings",
      })[key] ?? key,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("VerifyEmailChange", () => {
  it("shows a recoverable failure state instead of a blank page", async () => {
    render(<VerifyEmailChange updateSession={false} updatedEmail="new@example.com" token="expired-token" />);

    expect(await screen.findByRole("heading", { name: /couldn.t confirm your email/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return to settings/i })).toHaveAttribute(
      "href",
      "/settings/my-account/profile"
    );
  });
});
