import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import common from "../../../../packages/i18n/locales/en/common.json";

const mocks = vi.hoisted(() => ({ language: "en-US" }));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    i18n: { language: mocks.language },
    t: (key: string, values?: Record<string, string>) => {
      const translated =
        {
          billing_price_cadence_member_monthly: "Per accepted member, billed monthly",
          billing_price_cadence_member_yearly: "Per accepted member, billed yearly",
          billing_price_cadence_monthly: "Billed monthly",
          billing_price_cadence_yearly: "Billed yearly",
          billing_free_branding: "Convenio branding stays on the booking page.",
          billing_free_calendar: "1 connected calendar — Keep availability tied to your main calendar.",
          billing_free_events: "2 active event types — Publish your two most useful booking links.",
          billing_pro_calendar: "Connect every calendar — Only show times that are truly free.",
          billing_pro_handoffs:
            "Webhooks and API keys — Send confirmed bookings into the tools that act on them.",
          billing_pro_unlimited: "Unlimited event types — Offer every kind of meeting you run.",
          billing_team_record:
            "Roles and booking history — Control who can change things and see what happened.",
          billing_team_roles: "Round-robin and collective scheduling — Find a time across the right people.",
          billing_team_scheduling: "Shared event types — Give the team one set of booking rules.",
          billing_weekly_member_equivalent: "{{price}} per accepted member per week when billed yearly",
        }[key] ?? key;
      return values ? translated.replace("{{price}}", values.price) : translated;
    },
  }),
}));

import { PlanSelector } from "./PlanSelector";

beforeEach(() => {
  mocks.language = "en-US";
});

it("uses the approved capability and outcome copy", () => {
  expect({
    free: [common.billing_free_events, common.billing_free_calendar, common.billing_free_branding],
    pro: [common.billing_pro_unlimited, common.billing_pro_calendar, common.billing_pro_handoffs],
    team: [common.billing_team_scheduling, common.billing_team_roles, common.billing_team_record],
  }).toEqual({
    free: [
      "2 active event types — Publish your two most useful booking links.",
      "1 connected calendar — Keep availability tied to your main calendar.",
      "Convenio branding stays on the booking page.",
    ],
    pro: [
      "Unlimited event types — Offer every kind of meeting you run.",
      "Connect every calendar — Only show times that are truly free.",
      "Webhooks and API keys — Send confirmed bookings into the tools that act on them.",
    ],
    team: [
      "Shared event types — Give the team one set of booking rules.",
      "Round-robin and collective scheduling — Find a time across the right people.",
      "Roles and booking history — Control who can change things and see what happened.",
    ],
  });
});

describe("PlanSelector", () => {
  it("formats paid and Free USD amounts with the active locale", () => {
    mocks.language = "de-DE";
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);
    const yearlyPro = new Intl.NumberFormat("de-DE", {
      currency: "USD",
      maximumFractionDigits: 0,
      style: "currency",
    }).format(96);
    const free = new Intl.NumberFormat("de-DE", {
      currency: "USD",
      maximumFractionDigits: 0,
      style: "currency",
    }).format(0);

    expect(view.getByText((_content, element) => element?.textContent === yearlyPro)).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "billing_view_all_plans" }));
    expect(view.getByText((_content, element) => element?.textContent === free)).toBeInTheDocument();
  });

  it("starts yearly and shows only the two paid plans", () => {
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

    expect(view.getByRole("button", { name: "billing_interval_yearly" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(view.getByText("$96")).toBeInTheDocument();
    expect(view.getByText("$144")).toBeInTheDocument();
    expect(view.getByText("Billed yearly")).toBeInTheDocument();
    expect(view.getByText("Per accepted member, billed yearly")).toBeInTheDocument();
    expect(view.getByText("$2.77 per accepted member per week when billed yearly")).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "billing_plan_pro" })).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "billing_plan_team" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "billing_plan_free" })).not.toBeInTheDocument();
    expect(
      view.getByText("Unlimited event types — Offer every kind of meeting you run.")
    ).toBeInTheDocument();
    expect(
      view.getByText("Connect every calendar — Only show times that are truly free.")
    ).toBeInTheDocument();
    expect(
      view.getByText("Webhooks and API keys — Send confirmed bookings into the tools that act on them.")
    ).toBeInTheDocument();
    expect(
      view.getByText("Shared event types — Give the team one set of booking rules.")
    ).toBeInTheDocument();
    expect(
      view.getByText("Round-robin and collective scheduling — Find a time across the right people.")
    ).toBeInTheDocument();
    expect(
      view.getByText("Roles and booking history — Control who can change things and see what happened.")
    ).toBeInTheDocument();
  });

  it("labels monthly prices and the accepted-member scope from the catalog", () => {
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

    fireEvent.click(view.getByRole("button", { name: "billing_interval_monthly" }));

    expect(view.getByText("$10")).toBeInTheDocument();
    expect(view.getByText("$15")).toBeInTheDocument();
    expect(view.getByText("Billed monthly")).toBeInTheDocument();
    expect(view.getByText("Per accepted member, billed monthly")).toBeInTheDocument();
  });

  it("reveals Free through View all plans", () => {
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

    fireEvent.click(view.getByRole("button", { name: "billing_view_all_plans" }));

    expect(view.getByRole("heading", { name: "billing_plan_free" })).toBeInTheDocument();
    expect(view.getByRole("link", { name: "billing_keep_working_free" })).toHaveAttribute(
      "href",
      "/event-types"
    );
    expect(
      view.getByText("2 active event types — Publish your two most useful booking links.")
    ).toBeInTheDocument();
    expect(
      view.getByText("1 connected calendar — Keep availability tied to your main calendar.")
    ).toBeInTheDocument();
    expect(view.getByText("Convenio branding stays on the booking page.")).toBeInTheDocument();
  });

  it("submits action-specific paid selections", () => {
    const onSelectPlan = vi.fn();
    const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={onSelectPlan} />);

    fireEvent.click(view.getByRole("button", { name: "billing_choose_pro" }));
    expect(onSelectPlan).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });

    fireEvent.click(view.getByRole("button", { name: "billing_interval_monthly" }));
    fireEvent.click(view.getByRole("button", { name: "billing_choose_team" }));
    expect(onSelectPlan).toHaveBeenCalledWith({ interval: "MONTH", plan: "TEAM" });
  });

  it("can present only the required plan without the Free sheet", () => {
    const view = render(
      <PlanSelector
        freeHref="/event-types"
        onSelectPlan={vi.fn()}
        showAllPlans={false}
        visiblePlans={["TEAM"]}
        ctaKeys={{ TEAM: "billing_upgrade_choose_team" }}
      />
    );

    expect(view.getByRole("heading", { name: "billing_plan_team" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "billing_plan_pro" })).not.toBeInTheDocument();
    expect(view.queryByRole("button", { name: "billing_view_all_plans" })).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: "billing_upgrade_choose_team" })).toBeInTheDocument();
  });
});
