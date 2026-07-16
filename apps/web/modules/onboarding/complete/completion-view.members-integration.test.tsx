import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  billingGet: vi.fn(),
  members: {
    acceptedSeats: 1,
    actorRole: "OWNER",
    canManageInvitations: false,
    id: 41,
    invitationDenial: { capability: "organizationInvitations", requiredPlan: "TEAM" },
    isArchived: false,
    members: [{ avatarUrl: null, email: "owner@example.com", id: 7, name: "Owner", role: "OWNER" }],
    name: "Operations",
    pendingInvitations: [],
    seatLimit: 50,
    slug: "operations",
  },
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: { user: {} }, status: "authenticated", update: vi.fn() }),
}));
vi.mock("@calcom/features/settings/appDir/SettingsHeader", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}));
vi.mock("@calcom/trpc/react", () => {
  const mutation = { isPending: false, mutate: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({
        client: { viewer: { billing: { get: { query: mocks.billingGet } } } },
        viewer: { organizations: { members: { invalidate: vi.fn() } } },
      }),
      viewer: {
        organizations: {
          changeRole: { useMutation: () => mutation },
          invite: { useMutation: () => mutation },
          members: { useQuery: () => ({ data: mocks.members, isError: false, isPending: false }) },
          removeMember: { useMutation: () => mutation },
          resendInvitation: { useMutation: () => mutation },
          revokeInvitation: { useMutation: () => mutation },
        },
      },
    },
  };
});
vi.mock("../../billing/PlanSelector", () => ({
  PlanSelector: () => <div>team plan prompt</div>,
}));
vi.mock("../../billing/usePaidPlanCheckout", () => ({
  usePaidPlanCheckout: () => ({ pendingPlan: undefined, startCheckout: vi.fn() }),
}));

import { OnboardingOrganizationMembersPanel } from "./completion-view";

describe("onboarding organization invitation prompt", () => {
  beforeEach(() => {
    mocks.billingGet.mockReset().mockResolvedValue({ subject: { id: 41, type: "ORGANIZATION" } });
  });

  it("opens the inactive-Team action through an authorized onboarding provider", async () => {
    render(<OnboardingOrganizationMembersPanel organizationId={41} />);

    await userEvent.click(screen.getByRole("button", { name: "organization_members_send_invitation" }));

    expect(mocks.billingGet).toHaveBeenCalledWith({ organizationId: 41 });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
