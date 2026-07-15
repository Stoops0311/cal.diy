import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks: { push: ReturnType<typeof vi.fn>; setIntent: ReturnType<typeof vi.fn> } = vi.hoisted(() => ({
  push: vi.fn(),
  setIntent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: { teamName?: string }) => {
      const translations: Record<string, string> = {
        continue: "Continue",
        onboarding_choose_another_setup: "Choose another setup",
        onboarding_continue_solo: "Continue on my own",
        onboarding_intent_bring: "I am bringing a team",
        onboarding_intent_bring_description: "Create the place where your team’s calendars can agree.",
        onboarding_intent_description: "Choose the setup that matches the work in front of you.",
        onboarding_intent_join: "I am joining a team",
        onboarding_intent_join_description: "Carry your availability into a team that already exists.",
        onboarding_intent_solo: "I work on my own",
        onboarding_intent_solo_description: "Set your calendar, availability, and booking page.",
        onboarding_intent_title: "How will you schedule?",
        onboarding_invite_recovery_description:
          "Use the invitation link in your email. Until it is accepted, Convenio cannot place you in that team.",
        onboarding_invite_recovery_title: "Your invitation opens the team.",
        onboarding_join_context_description:
          "Set your calendar first. The team is already connected to your account.",
        onboarding_join_context_title: `You’re joining ${values?.teamName ?? ""}.`,
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("../components/OnboardingLayout", () => ({
  OnboardingLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("../components/OnboardingCard", () => ({
  OnboardingCard: ({
    children,
    footer,
    subtitle,
    title,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    subtitle: string;
    title: string;
  }) => (
    <section>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
      {footer}
    </section>
  ),
}));

vi.mock("../components/onboarding-continuation-prompt", () => ({
  OnboardingContinuationPrompt: () => null,
}));

vi.mock("../store/onboarding-store", () => ({
  useOnboardingStore: () => ({ setIntent: mocks.setIntent }),
}));

import { OnboardingView } from "./onboarding-view";

describe("OnboardingView", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.setIntent.mockReset();
  });

  it("asks for setup intent without presenting billing plans", () => {
    render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);

    expect(screen.getByRole("heading", { name: "How will you schedule?" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "I work on my own" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "I am joining a team" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "I am bringing a team" })).toBeVisible();
    expect(screen.queryByText(/price|plan/i)).not.toBeInTheDocument();
  });

  it("continues solo through personal setup", async () => {
    const user = userEvent.setup();
    render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);

    await user.click(screen.getByRole("radio", { name: "I work on my own" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(mocks.setIntent).toHaveBeenCalledWith("solo");
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
  });

  it("shows accepted team context before personal setup", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingView
        acceptedOrganization={{ id: 41, name: "Operations", role: "MEMBER", slug: "operations" }}
        userEmail="ada@example.com"
      />
    );

    await user.click(screen.getByRole("radio", { name: "I am joining a team" }));
    expect(screen.getByText("You’re joining Operations.")).toBeVisible();
    expect(
      screen.getByText("Set your calendar first. The team is already connected to your account.")
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(mocks.setIntent).toHaveBeenCalledWith("join-team");
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
  });

  it("uses invitation-link recovery when no accepted membership exists", async () => {
    const user = userEvent.setup();
    render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);

    await user.click(screen.getByRole("radio", { name: "I am joining a team" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Your invitation opens the team.")).toBeVisible();
    expect(screen.getByText(/Use the invitation link in your email/)).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continue on my own" }));
    expect(mocks.setIntent).toHaveBeenLastCalledWith("join-team");
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
  });

  it("lets a person leave invitation recovery without persisting another intent", async () => {
    const user = userEvent.setup();
    render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);

    await user.click(screen.getByRole("radio", { name: "I am joining a team" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Choose another setup" }));

    expect(screen.getByRole("radio", { name: "I am joining a team" })).toBeVisible();
    expect(mocks.setIntent).toHaveBeenCalledTimes(1);
    expect(mocks.setIntent).toHaveBeenCalledWith("join-team");
  });

  it("supports keyboard selection and routes team creators to the Clerk bootstrap step", async () => {
    const user = userEvent.setup();
    render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);

    const bringTeam = screen.getByRole("radio", { name: "I am bringing a team" });
    bringTeam.focus();
    await user.keyboard("[Space]");
    expect(bringTeam).toBeChecked();
    await user.tab();
    await user.keyboard("{Enter}");

    expect(mocks.setIntent).toHaveBeenCalledWith("bring-team");
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/team");
  });
});
