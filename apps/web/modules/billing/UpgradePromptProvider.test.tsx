import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaidSelection } from "./PlanSelector";
import type { CheckoutContext } from "./usePaidPlanCheckout";

type CheckoutOptions = {
  organizationId?: number;
  returnTo?: string;
  onBeforeNavigate?(context: CheckoutContext): void;
};

const mocks = vi.hoisted(() => ({
  billingGet: vi.fn(),
  checkoutOptions: undefined as CheckoutOptions | undefined,
  saveUpgradeIntent: vi.fn(),
  session: {
    user: { org: { id: 41, role: "OWNER" } },
  } as { user: { org?: { id: number; role: "OWNER" | "ADMIN" | "MEMBER" } } },
  startCheckout: vi.fn(),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      client: { viewer: { billing: { get: { query: mocks.billingGet } } } },
    }),
  },
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: mocks.session, status: "authenticated", update: vi.fn() }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    i18n: { language: "en-US" },
    t: (key: string, values?: { feature?: string; plan?: string }) =>
      key === "billing_upgrade_title"
        ? `${values?.feature} belongs in ${values?.plan}.`
        : ({
            billing_plan_team: "Team",
            billing_plan_pro: "Pro",
            billing_upgrade_booking_audit_description:
              "Keep the decisions behind every booking visible to the people responsible for it.",
            billing_upgrade_choose_pro: "Choose Pro",
            billing_upgrade_choose_team: "Bring in the team",
            billing_upgrade_not_now: "Not now",
            close: "Close",
          }[key] ?? key),
  }),
}));

vi.mock("./upgradeIntent", () => ({ saveUpgradeIntent: mocks.saveUpgradeIntent }));

vi.mock("./usePaidPlanCheckout", () => ({
  usePaidPlanCheckout: (options: CheckoutOptions) => {
    mocks.checkoutOptions = options;
    return {
      pendingPlan: undefined,
      startCheckout: (selection: PaidSelection) => {
        const context: CheckoutContext = { selection };
        if (selection.plan === "TEAM" && options.organizationId !== undefined) {
          context.organizationId = options.organizationId;
        }
        options.onBeforeNavigate?.(context);
        mocks.startCheckout(selection);
      },
    };
  },
}));

import { BookingHistoryUpgradePrompt } from "./BookingHistoryUpgradePrompt";
import {
  type OpenUpgradePromptInput,
  UpgradePromptProvider,
  useUpgradePrompt,
} from "./UpgradePromptProvider";

const prompt = {
  capability: "bookingAudit" as const,
  description: "Keep the decisions behind every booking visible to the people responsible for it.",
  featureName: "Booking history",
  requiredPlan: "TEAM" as const,
  returnTo: "/booking/book_123/logs",
  resume: { kind: "openBookingAudit" as const, bookingUid: "book_123" },
};

function Harness({ input = prompt }: { input?: OpenUpgradePromptInput }): React.ReactElement {
  const { openUpgradePrompt } = useUpgradePrompt();
  return (
    <button onClick={() => openUpgradePrompt(input)} type="button">
      open
    </button>
  );
}

function openPrompt(input: OpenUpgradePromptInput = prompt) {
  const view = render(
    <UpgradePromptProvider>
      <Harness input={input} />
    </UpgradePromptProvider>
  );
  fireEvent.click(view.getByRole("button", { name: "open" }));
  return view;
}

describe("UpgradePromptProvider", () => {
  beforeEach(() => {
    mocks.billingGet.mockReset();
    mocks.session = { user: { org: { id: 41, role: "OWNER" } } };
    mocks.saveUpgradeIntent.mockClear();
    mocks.startCheckout.mockClear();
  });

  it("opens a Clerk-shaped organization prompt only after authoritative billing access", async () => {
    mocks.session = { user: {} };
    mocks.billingGet.mockResolvedValue({ subject: { id: 77, type: "ORGANIZATION" } });
    const input: OpenUpgradePromptInput = {
      capability: "organizationInvitations",
      featureName: "Team invitations",
      organizationId: 77,
      requiredPlan: "TEAM",
      resume: { kind: "openOrganizationInvitations", organizationId: 77 },
      returnTo: "/settings/organizations/members?organizationId=77",
    };

    const view = openPrompt(input);

    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.billingGet).toHaveBeenCalledWith({ organizationId: 77 });
    expect(await view.findByRole("dialog")).toBeInTheDocument();
  });

  it("keeps a Clerk-shaped organization prompt closed when billing access is denied", async () => {
    mocks.session = { user: {} };
    mocks.billingGet.mockRejectedValue(new Error("Forbidden"));
    const view = openPrompt({
      capability: "organizationInvitations",
      featureName: "Team invitations",
      organizationId: 77,
      requiredPlan: "TEAM",
      resume: { kind: "openOrganizationInvitations", organizationId: 77 },
      returnTo: "/settings/organizations/members?organizationId=77",
    });

    await waitFor(() => expect(mocks.billingGet).toHaveBeenCalledWith({ organizationId: 77 }));
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("rejects an explicit session-organization mismatch without querying", () => {
    const view = openPrompt({
      capability: "organizationInvitations",
      featureName: "Team invitations",
      organizationId: 77,
      requiredPlan: "TEAM",
      resume: { kind: "openOrganizationInvitations", organizationId: 77 },
      returnTo: "/settings/organizations/members?organizationId=77",
    });

    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.billingGet).not.toHaveBeenCalled();
  });

  it("presents only the required plan with exact Convenio copy and dismisses without upgrading", () => {
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );

    fireEvent.click(view.getByRole("button", { name: "open" }));

    expect(view.getByText("Booking history belongs in Team.")).toBeInTheDocument();
    expect(
      view.getByText("Keep the decisions behind every booking visible to the people responsible for it.")
    ).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "Team" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "Pro" })).not.toBeInTheDocument();
    expect(view.queryByRole("button", { name: "billing_view_all_plans" })).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: "Bring in the team" })).toBeInTheDocument();

    fireEvent.click(view.getByRole("button", { name: "Not now" }));
    expect(view.queryByText("Booking history belongs in Team.")).not.toBeInTheDocument();
    expect(mocks.startCheckout).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN"] as const)("saves the organization intent before checkout for an %s", (role) => {
    mocks.session = { user: { org: { id: 41, role } } };
    mocks.saveUpgradeIntent.mockClear();
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );

    fireEvent.click(view.getByRole("button", { name: "open" }));
    fireEvent.click(view.getByRole("button", { name: "Bring in the team" }));

    expect(mocks.checkoutOptions?.organizationId).toBe(41);
    expect(mocks.saveUpgradeIntent).toHaveBeenCalledWith(
      {
        capability: "bookingAudit",
        requiredPlan: "TEAM",
        returnTo: "/booking/book_123/logs",
        resume: { kind: "openBookingAudit", bookingUid: "book_123" },
      },
      { subject: { kind: "organization", organizationId: 41 } }
    );
    expect(mocks.saveUpgradeIntent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startCheckout.mock.invocationCallOrder[0]
    );
  });

  it("does not treat an ordinary member's organization as manageable", () => {
    mocks.session = { user: { org: { id: 41, role: "MEMBER" } } };
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );

    fireEvent.click(view.getByRole("button", { name: "open" }));
    fireEvent.click(view.getByRole("button", { name: "Bring in the team" }));

    expect(mocks.checkoutOptions?.organizationId).toBeUndefined();
    expect(mocks.saveUpgradeIntent).toHaveBeenCalledWith(expect.any(Object), { subject: undefined });
  });

  it("renders approved Pro copy and leaves the chevron to PlanSelector", () => {
    const input = {
      capability: "canCreateApiKeys" as const,
      description: "Let your systems act on the scheduling record.",
      featureName: "API keys",
      requiredPlan: "PRO" as const,
      resume: { kind: "returnToFeature" as const },
      returnTo: "/settings/developer/api-keys",
    };
    const view = openPrompt(input);

    expect(view.getByText("API keys belongs in Pro.")).toBeInTheDocument();
    expect(view.getByText(input.description)).toBeInTheDocument();
    const cta = view.getByRole("button", { name: "Choose Pro" });
    expect(cta).toHaveTextContent("Choose Pro›");
    expect("Choose Pro").not.toContain("›");
    expect(mocks.checkoutOptions?.returnTo).toBe(input.returnTo);
    fireEvent.click(cta);
    expect(mocks.saveUpgradeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "canCreateApiKeys", resume: { kind: "returnToFeature" } }),
      { subject: { kind: "user" } }
    );
  });

  it("accepts only the manageable contextual organization as the Team subject", () => {
    const input: OpenUpgradePromptInput = {
      capability: "canCreateWebhooks",
      description: "Send confirmed bookings into the tools that act on them.",
      featureName: "Webhooks",
      organizationId: 77,
      requiredPlan: "TEAM",
      resume: { kind: "returnToFeature" },
      returnTo: "/settings/developer/webhooks",
    };
    const mismatched = openPrompt(input);
    expect(mismatched.queryByRole("dialog")).not.toBeInTheDocument();
    mismatched.unmount();

    mocks.session = { user: { org: { id: 77, role: "ADMIN" } } };
    const view = openPrompt(input);
    fireEvent.click(view.getByRole("button", { name: "Bring in the team" }));

    expect(mocks.checkoutOptions?.organizationId).toBe(77);
    expect(mocks.saveUpgradeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ capability: input.capability }),
      {
        subject: { kind: "organization", organizationId: 77 },
      }
    );
    expect(mocks.billingGet).not.toHaveBeenCalled();
  });

  it.each([
    { user: { org: { id: 41, role: "OWNER" as const } } },
    { user: {} },
    { user: { org: { id: 41, role: "MEMBER" as const } } },
  ])("rejects a direct contextual Team prompt without a requested organization %#", (session) => {
    mocks.session = session;
    const view = openPrompt({
      capability: "canCreateWebhooks",
      featureName: "Webhooks",
      requiredPlan: "TEAM",
      resume: { kind: "returnToFeature" },
      returnTo: "/settings/developer/webhooks",
    });

    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.startCheckout).not.toHaveBeenCalled();
    expect(mocks.saveUpgradeIntent).not.toHaveBeenCalled();
    expect(mocks.billingGet).not.toHaveBeenCalled();
  });

  it("preserves the exact organization invitation intent before Team checkout", () => {
    const input = {
      capability: "organizationInvitations" as const,
      description: "Bring people, roles, and shared event types into one place.",
      featureName: "Team invitations",
      requiredPlan: "TEAM" as const,
      resume: { kind: "openOrganizationInvitations" as const, organizationId: 41 },
      returnTo: "/settings/organizations/members?organizationId=41",
    };
    const view = openPrompt(input);
    expect(view.getByText("Team invitations belongs in Team.")).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "Bring in the team" }));
    expect(mocks.saveUpgradeIntent).toHaveBeenCalledWith(
      {
        capability: "organizationInvitations",
        requiredPlan: "TEAM",
        resume: { kind: "openOrganizationInvitations", organizationId: 41 },
        returnTo: input.returnTo,
      },
      { subject: { kind: "organization", organizationId: 41 } }
    );
  });

  it("closes on Escape and restores focus to the opener", async () => {
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );
    const opener = view.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("scopes 44px coarse-pointer targets to every interactive prompt control", () => {
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );
    fireEvent.click(view.getByRole("button", { name: "open" }));

    const dialog = view.getByRole("dialog");
    expect(dialog).toHaveClass(
      "[@media(pointer:coarse)]:[&_button]:min-h-11",
      "[@media(pointer:coarse)]:[&_button]:min-w-11"
    );
    const controls = [
      view.getByRole("button", { name: "billing_interval_monthly" }),
      view.getByRole("button", { name: "billing_interval_yearly" }),
      view.getByRole("button", { name: "Bring in the team" }),
      view.getByRole("button", { name: "Not now" }),
      view.getByRole("button", { name: "Close" }),
    ];
    for (const control of controls) expect(dialog).toContainElement(control);
    expect(controls[0]).toHaveClass("min-h-10");
  });

  it("dismisses from the real Sheet overlay and restores focus to the opener", async () => {
    const user = userEvent.setup();
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );
    const opener = view.getByRole("button", { name: "open" });
    await user.click(opener);
    const overlay = view.getByRole("dialog").parentElement;
    if (!overlay) throw new Error("Expected the Sheet overlay");

    await user.click(overlay);

    await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("restores focus to the visible gated action after every auto-open dismissal", async () => {
    const user = userEvent.setup();
    const view = render(
      <UpgradePromptProvider>
        <BookingHistoryUpgradePrompt bookingUid="book_123" />
      </UpgradePromptProvider>
    );

    let dialog = await view.findByRole("dialog");
    const gatedAction = view.container.querySelector("section button");
    if (!gatedAction) throw new Error("Expected the gated Team action outside the upgrade Sheet");

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(gatedAction).toHaveFocus());

    await user.click(gatedAction);
    dialog = await view.findByRole("dialog");
    const overlay = dialog.parentElement;
    if (!overlay) throw new Error("Expected the Sheet overlay");
    await user.click(overlay);
    await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(gatedAction).toHaveFocus());

    await user.click(gatedAction);
    await user.click(await view.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(gatedAction).toHaveFocus());
  });
});
