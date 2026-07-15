import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks: { push: ReturnType<typeof vi.fn>; setIntent: ReturnType<typeof vi.fn> } = vi.hoisted(() => ({
  push: vi.fn(),
  setIntent: vi.fn(),
}));
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
  onboarding_join_context_title: "You’re joining {{teamName}}.",
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: { teamName?: string }) =>
      (translations[key] ?? key).replace("{{teamName}}", values?.teamName ?? ""),
  }),
}));
vi.mock("../components/OnboardingLayout", () => ({
  OnboardingLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../components/OnboardingCard", () => ({
  OnboardingCard: (props: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    subtitle: string;
    title: string;
  }) => (
    <section>
      <h1>{props.title}</h1>
      <p>{props.subtitle}</p>
      {props.children}
      {props.footer}
    </section>
  ),
}));
vi.mock("../components/onboarding-continuation-prompt", () => ({
  OnboardingContinuationPrompt: () => <div>Resume legacy team details</div>,
}));
vi.mock("../store/onboarding-store", () => ({
  useOnboardingStore: () => ({
    selectedPlan: "team",
    setIntent: mocks.setIntent,
    teamDetails: { name: "Legacy team details" },
  }),
}));

import { OnboardingView } from "./onboarding-view";

function renderView(
  acceptedOrganization: React.ComponentProps<typeof OnboardingView>["acceptedOrganization"] = null
): void {
  render(<OnboardingView acceptedOrganization={acceptedOrganization} userEmail="ada@example.com" />);
}

describe("OnboardingView", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.setIntent.mockReset();
  });

  it("shows the three intents without legacy plan overlays and styles the real radio target", () => {
    renderView();
    for (const name of ["I work on my own", "I am joining a team", "I am bringing a team"]) {
      expect(screen.getByRole("radio", { name })).toBeVisible();
    }
    expect(screen.queryByText("Resume legacy team details")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "I work on my own" }).parentElement).toHaveClass(
      "focus-within:ring-2",
      "focus-within:ring-emphasis",
      "motion-reduce:[&_button]:transition-none",
      "[@media(pointer:coarse)]:min-h-11"
    );
  });

  it.each([
    ["I work on my own", "solo", "/onboarding/personal/settings"],
    ["I am bringing a team", "bring-team", "/onboarding/team"],
  ])("routes %s", async (label, intent, route) => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("radio", { name: label }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.setIntent).toHaveBeenCalledWith(intent);
    expect(mocks.push).toHaveBeenCalledWith(route);
  });

  it("shows accepted team context and persists the accepted join", async () => {
    const user = userEvent.setup();
    renderView({ id: 41, name: "Operations", role: "MEMBER", slug: "operations" });
    await user.click(screen.getByRole("radio", { name: "I am joining a team" }));
    expect(screen.getByText("You’re joining Operations.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.setIntent).toHaveBeenCalledWith("join-team");
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
  });

  it("persists a missing-team join only when continuing alone", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("radio", { name: "I am joining a team" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.setIntent).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Your invitation opens the team.");
    expect(screen.getByRole("button", { name: "Continue on my own" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(mocks.setIntent).toHaveBeenCalledWith("join-team");
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
  });

  it("moves focus into recovery and back to the selected radio without persisting", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("radio", { name: "I am joining a team" }));
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Continue on my own" })).toHaveFocus();
    await user.tab({ shift: true });
    await user.keyboard("{Enter}");
    expect(screen.getByRole("radio", { name: "I am joining a team" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("How will you schedule?");
    expect(mocks.setIntent).not.toHaveBeenCalled();
  });
});
