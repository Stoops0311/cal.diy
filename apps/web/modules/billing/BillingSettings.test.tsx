import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

import { BillingSettingsView } from "./BillingSettings";

const freeProjection = {
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  currentPeriodStart: null,
  interval: null,
  plan: "FREE" as const,
  seatCount: 1,
  status: "NONE" as const,
  subject: { id: 7, type: "USER" as const },
};

describe("BillingSettingsView", () => {
  it("keeps checkout return pending until the verified projection changes", () => {
    const view = render(
      <BillingSettingsView
        checkoutPending
        isMutating={false}
        onCancel={vi.fn()}
        onChangeInterval={vi.fn()}
        onOpenPortal={vi.fn()}
        onReconcile={vi.fn()}
        projection={freeProjection}
      />
    );

    expect(view.getByText("billing_checkout_pending_title")).toBeInTheDocument();
    expect(view.getByText("billing_plan_free")).toBeInTheDocument();
    expect(view.queryByText("billing_checkout_active_title")).not.toBeInTheDocument();
  });

  it("shows active Team seats and routes interval changes through an app action", () => {
    const onChangeInterval = vi.fn();
    const view = render(
      <BillingSettingsView
        checkoutPending={false}
        isMutating={false}
        onCancel={vi.fn()}
        onChangeInterval={onChangeInterval}
        onOpenPortal={vi.fn()}
        onReconcile={vi.fn()}
        projection={{
          ...freeProjection,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          interval: "MONTH",
          plan: "TEAM",
          seatCount: 4,
          status: "ACTIVE",
          subject: { id: 41, type: "ORGANIZATION" },
        }}
      />
    );

    expect(view.getByText("billing_plan_team")).toBeInTheDocument();
    expect(view.getByText("billing_seat_count:4")).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "billing_switch_to_annual" }));
    expect(onChangeInterval).toHaveBeenCalledWith("YEAR");
  });

  it("shows period-end cancellation without offering a second cancellation", () => {
    const view = render(
      <BillingSettingsView
        checkoutPending={false}
        isMutating={false}
        onCancel={vi.fn()}
        onChangeInterval={vi.fn()}
        onOpenPortal={vi.fn()}
        onReconcile={vi.fn()}
        projection={{
          ...freeProjection,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
          interval: "YEAR",
          plan: "PRO",
          status: "ACTIVE",
        }}
      />
    );

    expect(view.getByText("billing_cancels_at_period_end")).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "billing_cancel_plan" })).not.toBeInTheDocument();
  });
});
