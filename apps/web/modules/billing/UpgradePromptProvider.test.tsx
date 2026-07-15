import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { CheckoutContext } from "./usePaidPlanCheckout";

type CheckoutOptions = {
  organizationId?: number;
  returnTo?: string;
  onBeforeNavigate?(context: CheckoutContext): void;
};

const mocks = vi.hoisted(() => ({
  checkoutOptions: undefined as CheckoutOptions | undefined,
  saveUpgradeIntent: vi.fn(),
  session: {
    user: { org: { id: 41, role: "OWNER" } },
  } as { user: { org?: { id: number; role: "OWNER" | "ADMIN" | "MEMBER" } } },
  startCheckout: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ data: mocks.session, status: "authenticated", update: vi.fn() }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) =>
      ({
        billing_plan_team: "TEAM",
        billing_upgrade_booking_audit_description:
          "Keep the decisions behind every booking visible to the people responsible for it.",
        billing_upgrade_booking_audit_title: "Booking history belongs in Team.",
        billing_upgrade_not_now: "Not now",
        close: "Close",
      })[key] ?? key,
  }),
}));

vi.mock("./upgradeIntent", () => ({ saveUpgradeIntent: mocks.saveUpgradeIntent }));

vi.mock("./usePaidPlanCheckout", () => ({
  usePaidPlanCheckout: (options: CheckoutOptions) => {
    mocks.checkoutOptions = options;
    return {
      pendingPlan: undefined,
      startCheckout: (selection: { interval: "YEAR"; plan: "TEAM" }) => {
        const context = { selection, organizationId: options.organizationId };
        options.onBeforeNavigate?.(context);
        mocks.startCheckout(selection);
      },
    };
  },
}));

import { UpgradePromptProvider, useUpgradePrompt } from "./UpgradePromptProvider";

const prompt = {
  capability: "bookingAudit" as const,
  featureName: "Booking history",
  requiredPlan: "TEAM" as const,
  returnTo: "/booking/book_123/logs",
  resume: { kind: "openBookingAudit" as const, bookingUid: "book_123" },
};

function Harness(): React.ReactElement {
  const { openUpgradePrompt } = useUpgradePrompt();
  return (
    <button onClick={() => openUpgradePrompt(prompt)} type="button">
      open
    </button>
  );
}

describe("UpgradePromptProvider", () => {
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
    expect(view.getByRole("heading", { name: "TEAM" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "billing_plan_pro" })).not.toBeInTheDocument();
    expect(view.queryByRole("button", { name: "billing_view_all_plans" })).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: "billing_upgrade_choose_team" })).toBeInTheDocument();

    fireEvent.click(view.getByRole("button", { name: "Not now" }));
    expect(view.queryByText("Booking history belongs in Team.")).not.toBeInTheDocument();
    expect(mocks.startCheckout).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN"] as const)("saves the organization intent before checkout for an %s", (role) => {
    mocks.session = { user: { org: { id: 41, role } } };
    mocks.saveUpgradeIntent.mockClear();
    mocks.startCheckout.mockClear();
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );

    fireEvent.click(view.getByRole("button", { name: "open" }));
    fireEvent.click(view.getByRole("button", { name: "billing_upgrade_choose_team" }));

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
    mocks.saveUpgradeIntent.mockClear();
    const view = render(
      <UpgradePromptProvider>
        <Harness />
      </UpgradePromptProvider>
    );

    fireEvent.click(view.getByRole("button", { name: "open" }));
    fireEvent.click(view.getByRole("button", { name: "billing_upgrade_choose_team" }));

    expect(mocks.checkoutOptions?.organizationId).toBeUndefined();
    expect(mocks.saveUpgradeIntent).toHaveBeenCalledWith(expect.any(Object), { subject: undefined });
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
      view.getByRole("button", { name: "billing_upgrade_choose_team" }),
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
});
