import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createdOrganization: null as { id: number; name: string; slug: string } | null,
  hydrated: true,
  intent: "solo" as "solo" | "join-team" | "bring-team" | null,
  push: vi.fn(),
  startCheckout: vi.fn(),
  submit: vi.fn(),
}));
const copy: Record<string, string> = {
  billing_choose_pro: "Choose Pro",
  billing_choose_team: "Bring in the team",
  billing_keep_working_free: "Keep working free",
  onboarding_complete_bring_description: "Choose Team when the calendars need one shared record.",
  onboarding_complete_bring_title: "{{teamName}} is in place.",
  onboarding_complete_create_team: "Create the team",
  onboarding_complete_join_description: "The team keeps the shared scheduling record.",
  onboarding_complete_join_missing_description: "Your invitation link is still the way into the team.",
  onboarding_complete_join_missing_title: "Your calendar is ready.",
  onboarding_complete_join_title: "Your calendar is ready for {{teamName}}.",
  onboarding_complete_loading: "Loading your setup",
  onboarding_complete_member_plan: "{{teamName}} manages the Team plan.",
  onboarding_complete_solo_description: "Choose how much of the work Convenio should carry now.",
  onboarding_complete_solo_title: "Your calendar is ready.",
};

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: { teamName?: string }) =>
      (copy[key] ?? key).replace("{{teamName}}", values?.teamName ?? ""),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: { apps: { integrations: { useQuery: () => ({ data: { items: [] }, isPending: false }) } } },
  },
}));
vi.mock("../../billing/PlanSelector", () => ({
  PlanSelector: (props: {
    onSelectPlan(selection: { interval: "YEAR"; plan: "PRO" | "TEAM" }): void;
    pendingPlan?: "PRO" | "TEAM";
    visiblePlans: ["PRO" | "TEAM"];
  }) => {
    const plan = props.visiblePlans[0];
    let label = "Bring in the team ›";
    if (plan === "PRO") label = "Choose Pro ›";
    return (
      <button
        disabled={props.pendingPlan === plan}
        onClick={() => props.onSelectPlan({ interval: "YEAR", plan })}
        type="button">
        {label}
      </button>
    );
  },
}));
vi.mock("../../billing/usePaidPlanCheckout", () => ({
  usePaidPlanCheckout: () => ({ pendingPlan: undefined, startCheckout: mocks.startCheckout }),
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
vi.mock("../hooks/useSubmitPersonalOnboarding", () => ({
  useSubmitPersonalOnboarding: () => ({ isSubmitting: false, submitPersonalOnboarding: mocks.submit }),
}));
vi.mock("../store/onboarding-store", () => {
  const useOnboardingStore = (selector: (state: typeof mocks) => unknown) => selector(mocks);
  useOnboardingStore.persist = {
    hasHydrated: () => mocks.hydrated,
    onFinishHydration: () => vi.fn(),
  };
  return { useOnboardingStore };
});
vi.mock("../components/onboarding-calendar-browser-view", () => ({
  OnboardingCalendarBrowserView: () => null,
}));
vi.mock("../personal/_components/useAppInstallation", () => ({
  useAppInstallation: () => ({
    createInstallHandlers: vi.fn(),
    installingAppSlug: null,
    setInstallingAppSlug: vi.fn(),
  }),
}));

import { PersonalCalendarView } from "../personal/calendar/personal-calendar-view";
import { CompletionView } from "./completion-view";

const organization = { id: 41, name: "Operations", role: "OWNER" as const, slug: "operations" };

describe("CompletionView", () => {
  beforeEach(() => {
    mocks.createdOrganization = null;
    mocks.hydrated = true;
    mocks.intent = "solo";
    mocks.push.mockReset();
    mocks.startCheckout.mockReset();
    mocks.submit.mockReset();
    mocks.submit.mockImplementation(async (options?: { afterComplete?: () => void }) =>
      options?.afterComplete?.()
    );
  });

  it("renders a hydration status before choosing a plan", () => {
    mocks.hydrated = false;
    render(<CompletionView acceptedOrganizations={[]} userEmail="ada@example.com" />);
    expect(screen.getByRole("status")).toHaveAccessibleName("Loading your setup");
    expect(screen.queryByRole("button", { name: "Choose Pro ›" })).not.toBeInTheDocument();
  });

  it("always completes through Keep working free", async () => {
    render(<CompletionView acceptedOrganizations={[]} userEmail="ada@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: "Keep working free" }));
    expect(mocks.submit).toHaveBeenCalledWith();
  });

  it("prevents a second paid submit while completion is pending", async () => {
    let finishCompletion: () => void = () => undefined;
    mocks.submit.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCompletion = resolve;
      })
    );
    render(<CompletionView acceptedOrganizations={[]} userEmail="ada@example.com" />);
    const paidAction = screen.getByRole("button", { name: "Choose Pro ›" });

    await userEvent.click(paidAction);
    expect(paidAction).toBeDisabled();
    await userEvent.click(paidAction);
    expect(mocks.submit).toHaveBeenCalledOnce();

    await act(async () => finishCompletion());
    expect(paidAction).toBeEnabled();
  });

  it.each(["continue", "onboarding_skip_for_now"])("routes calendar %s to this decision", async (action) => {
    render(<PersonalCalendarView userEmail="ada@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: action }));
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/complete");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each([
    ["solo", []],
    ["join-team", []],
  ] as const)("offers Pro for %s without an accepted team", async (intent, acceptedOrganizations) => {
    mocks.intent = intent;
    render(<CompletionView acceptedOrganizations={[...acceptedOrganizations]} userEmail="ada@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: "Choose Pro ›" }));
    expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });
    expect(screen.getByRole("button", { name: "Keep working free" })).toBeVisible();
  });

  it("binds a created team checkout to its organization", async () => {
    mocks.intent = "bring-team";
    mocks.createdOrganization = { id: 41, name: "Operations", slug: "operations" };
    render(<CompletionView acceptedOrganizations={[]} userEmail="owner@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: "Bring in the team ›" }));
    expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "TEAM" }, 41);
  });

  it.each(["OWNER", "ADMIN"] as const)("lets an accepted %s manage Team", async (role) => {
    mocks.intent = "join-team";
    render(
      <CompletionView acceptedOrganizations={[{ ...organization, role }]} userEmail="owner@example.com" />
    );
    await userEvent.click(screen.getByRole("button", { name: "Bring in the team ›" }));
    expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "TEAM" }, 41);
  });

  it("leaves Team checkout to the accepted team's managers", () => {
    mocks.intent = "join-team";
    render(
      <CompletionView
        acceptedOrganizations={[{ ...organization, role: "MEMBER" }]}
        userEmail="member@example.com"
      />
    );
    expect(screen.getByText("Operations manages the Team plan.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Bring in the team ›" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep working free" })).toBeVisible();
  });

  it("recovers when a created team is missing", () => {
    mocks.intent = "bring-team";
    render(<CompletionView acceptedOrganizations={[]} userEmail="owner@example.com" />);
    expect(screen.getByRole("link", { name: "Create the team" })).toHaveAttribute("href", "/onboarding/team");
    expect(screen.queryByRole("button", { name: "Bring in the team ›" })).not.toBeInTheDocument();
  });
});
