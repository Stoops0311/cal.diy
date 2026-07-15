import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CreateOptions = {
  onError(error: { message: string }): void;
  onSuccess(result: { acceptedSeats: number; archived: boolean; organizationId: number }): void;
};

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createOptions: undefined as CreateOptions | undefined,
  push: vi.fn(),
  setCreatedOrganization: vi.fn(),
  showToast: vi.fn(),
}));

const translations: Record<string, string> = {
  onboarding_team_create_action: "Create team and continue ›",
  onboarding_team_create_boundary: "Only you are added now. Invitations follow after setup.",
  onboarding_team_create_description: "Create the organization that will hold the shared calendar.",
  onboarding_team_create_error: "The team could not be created. Try again.",
  onboarding_team_create_title: "Name the team.",
  organization_bootstrap_slug_hint: "Used in the team URL.",
  organization_name: "Organization name",
  slug: "Slug",
};

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => translations[key] ?? key }),
}));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      organizations: {
        create: {
          useMutation: (options: CreateOptions) => {
            mocks.createOptions = options;
            return { isPending: false, mutate: mocks.create };
          },
        },
      },
    },
  },
}));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: mocks.showToast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../components/OnboardingLayout", () => ({
  OnboardingLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../components/OnboardingCard", () => ({
  OnboardingCard: ({
    children,
    subtitle,
    title,
  }: {
    children: React.ReactNode;
    subtitle: string;
    title: string;
  }) => (
    <section>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </section>
  ),
}));
vi.mock("../store/onboarding-store", () => ({
  useOnboardingStore: (
    selector: (state: { setCreatedOrganization: typeof mocks.setCreatedOrganization }) => unknown
  ) => selector({ setCreatedOrganization: mocks.setCreatedOrganization }),
}));

import { BringTeamView } from "./bring-team-view";

describe("BringTeamView", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.createOptions = undefined;
    mocks.push.mockReset();
    mocks.setCreatedOrganization.mockReset();
    mocks.showToast.mockReset();
  });

  it("stores the reconciled organization before continuing personal setup", async () => {
    const user = userEvent.setup();
    render(<BringTeamView userEmail="owner@example.com" />);

    await user.type(screen.getByLabelText("Organization name"), "Operations");
    await user.click(screen.getByRole("button", { name: "Create team and continue ›" }));

    expect(mocks.create).toHaveBeenCalledWith({ name: "Operations", slug: "operations" });
    mocks.createOptions?.onSuccess({ acceptedSeats: 1, archived: false, organizationId: 41 });
    expect(mocks.setCreatedOrganization).toHaveBeenCalledWith({
      id: 41,
      name: "Operations",
      slug: "operations",
    });
    expect(mocks.setCreatedOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.push.mock.invocationCallOrder[0]
    );
    expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
  });

  it("stays on the form when Clerk creation fails", async () => {
    const user = userEvent.setup();
    render(<BringTeamView userEmail="owner@example.com" />);

    await user.type(screen.getByLabelText("Organization name"), "Operations");
    await user.click(screen.getByRole("button", { name: "Create team and continue ›" }));
    mocks.createOptions?.onError({ message: "Clerk organization operation failed" });

    expect(mocks.showToast).toHaveBeenCalledWith("The team could not be created. Try again.", "error");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Organization name")).toHaveValue("Operations");
    expect(screen.getByRole("button", { name: "Create team and continue ›" })).toBeVisible();
  });

  it("states the honest boundary without claiming invitation or member access", () => {
    render(<BringTeamView userEmail="owner@example.com" />);

    expect(screen.getByText("Only you are added now. Invitations follow after setup.")).toBeVisible();
    expect(screen.queryByText(/pending invitation/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /members/i })).not.toBeInTheDocument();
  });

  it("keeps the form usable for coarse pointers and reduced motion", () => {
    render(<BringTeamView userEmail="owner@example.com" />);

    expect(screen.getByRole("form", { name: "Create team and continue ›" })).toHaveClass(
      "motion-reduce:[&_button]:transition-none",
      "[@media(pointer:coarse)]:[&_button]:min-h-11",
      "[@media(pointer:coarse)]:[&_input]:min-h-11"
    );
  });
});
