# Convenio Pricing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the off-brand pricing surface with a shared, yearly-first Convenio plan selector that serves anonymous pricing and authenticated plan selection without changing Polar checkout behavior.

**Architecture:** Keep PricingPage as the only checkout controller and extract a presentation-only PlanSelector. The stable /pricing route chooses a marketing wrapper for anonymous visitors and the authenticated Shell for signed-in users. Marketing CSS remains scoped to .cv-root but is imported once from the root layout because current Next.js App Router permits global CSS imports only from layouts.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Radix Sheet through @calcom/ui, next-i18next, Vitest, Playwright.

## Global Constraints

- Preserve Polar hosted checkout, billing mutations, webhook processing, entitlement rules, and product configuration.
- Use the existing dynamic-seat model; an accepted organization member is one billed seat.
- Use existing theme tokens and direct shared-component imports; no hard-coded brand colors, gradients, or decorative shadows.
- Default to yearly, show Pro and Team, and place Free behind “View all plans.”
- Use the approved Convenio copy from docs/superpowers/specs/2026-07-16-convenio-monetization-ux-design.md.
- Do not claim an unconfigured trial, discount, customer count, testimonial, or adoption statistic.
- Add all UI strings to packages/i18n/locales/en/common.json.
- Preserve every pre-existing uncommitted change and do not edit generated files.
- Use TDD, Biome, focused tests, and yarn type-check:ci --force before handoff.

---

### Task 1: Shared yearly-first plan selector

**Files:**
- Create: apps/web/modules/billing/PlanSelector.tsx
- Create: apps/web/modules/billing/PlanSelector.test.tsx
- Modify: packages/i18n/locales/en/common.json

**Interfaces:**
- Consumes: PAID_PLAN_CATALOG; shared Button, Icon, and Sheet components.
- Produces:

    export type PaidSelection =
      | { interval: BillingIntervalType; plan: "PRO" }
      | { interval: BillingIntervalType; plan: "TEAM" };

    export type PlanSelectorProps = {
      freeHref: string;
      onSelectPlan(selection: PaidSelection): void;
      pendingPlan?: PaidPlanKey;
    };

    export function PlanSelector(props: PlanSelectorProps): React.ReactElement;

- [ ] **Step 1: Write the failing component tests**

Create apps/web/modules/billing/PlanSelector.test.tsx:

    import { fireEvent, render } from "@testing-library/react";
    import { describe, expect, it, vi } from "vitest";

    vi.mock("@calcom/lib/hooks/useLocale", () => ({
      useLocale: () => ({
        t: (key: string, values?: Record<string, string>) =>
          values ? key + ":" + Object.values(values).join(":") : key,
      }),
    }));

    import { PlanSelector } from "./PlanSelector";

    describe("PlanSelector", () => {
      it("starts yearly and shows only the two paid plans", () => {
        const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

        expect(view.getByRole("button", { name: "billing_interval_yearly" })).toHaveAttribute(
          "aria-pressed",
          "true"
        );
        expect(view.getByText("$96")).toBeInTheDocument();
        expect(view.getByText("$144")).toBeInTheDocument();
        expect(view.getByRole("heading", { name: "billing_plan_pro" })).toBeInTheDocument();
        expect(view.getByRole("heading", { name: "billing_plan_team" })).toBeInTheDocument();
        expect(view.queryByRole("heading", { name: "billing_plan_free" })).not.toBeInTheDocument();
      });

      it("reveals Free through View all plans", () => {
        const view = render(<PlanSelector freeHref="/event-types" onSelectPlan={vi.fn()} />);

        fireEvent.click(view.getByRole("button", { name: "billing_view_all_plans" }));

        expect(view.getByRole("heading", { name: "billing_plan_free" })).toBeInTheDocument();
        expect(view.getByRole("link", { name: "billing_keep_working_free" })).toHaveAttribute(
          "href",
          "/event-types"
        );
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
    });

- [ ] **Step 2: Run the test and verify the missing component failure**

Run:

    TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx

Expected: FAIL because ./PlanSelector does not exist.

- [ ] **Step 3: Implement the selector**

Create apps/web/modules/billing/PlanSelector.tsx with the public interface above and this exact data:

    const paidPlans = [
      {
        plan: "PRO",
        name: "billing_plan_pro",
        outcome: "billing_pro_outcome",
        description: "billing_pro_description",
        cta: "billing_choose_pro",
        features: ["billing_pro_unlimited", "billing_pro_calendar", "billing_pro_handoffs"],
      },
      {
        plan: "TEAM",
        name: "billing_plan_team",
        outcome: "billing_team_outcome",
        description: "billing_team_description",
        cta: "billing_choose_team",
        features: ["billing_team_scheduling", "billing_team_roles", "billing_team_record"],
      },
    ] as const;

Format prices only from PAID_PLAN_CATALOG:

    function formatPrice(amountInCents: number): string {
      return new Intl.NumberFormat("en-US", {
        currency: "USD",
        maximumFractionDigits: amountInCents % 100 === 0 ? 0 : 2,
        style: "currency",
      }).format(amountInCents / 100);
    }

Render these states and no others:

1. useState<BillingIntervalType>("YEAR").
2. A tokenized MONTH/YEAR pressed-state group with a minimum 40px visual height.
3. A two-column Pro/Team grid using border-subtle, bg-default, text-emphasis, text-subtle, font-cal, and font-mono.
4. Exact price from PAID_PLAN_CATALOG[plan].prices[interval].
5. For YEAR only, a weekly amount computed as Math.round(amountInCents / 52), formatted through formatPrice, and passed to billing_weekly_equivalent.
6. An action-specific primary Button that calls onSelectPlan({ interval, plan: plan.plan }) and renders a separate aria-hidden ›.
7. billing_cancel_anytime immediately below each paid CTA.
8. billing_plan_proof below the grid.
9. A Sheet triggered by billing_view_all_plans. Its body contains the Free plan only, with $0 and a secondary Button to freeHref.
10. No billing_most_popular, blue/cyan class, gradient, or static price table.

Use these direct imports:

    import {
      PAID_PLAN_CATALOG,
      type BillingIntervalType,
      type PaidPlanKey,
    } from "@calcom/features/billing/lib/plans";
    import { useLocale } from "@calcom/lib/hooks/useLocale";
    import classNames from "@calcom/ui/classNames";
    import { Button } from "@calcom/ui/components/button";
    import { Icon } from "@calcom/ui/components/icon";
    import {
      Sheet,
      SheetBody,
      SheetContent,
      SheetDescription,
      SheetHeader,
      SheetTitle,
      SheetTrigger,
    } from "@calcom/ui/components/sheet";

- [ ] **Step 4: Install the approved copy**

Replace the rendered billing pricing values and add these values in packages/i18n/locales/en/common.json:

    "billing_pricing_eyebrow": "Plans for the work",
    "billing_pricing_title": "One calendar. Or every calendar in the room.",
    "billing_pricing_description": "Choose the way you schedule now. Convenio keeps the handoff to payment brief, then brings you back to the work.",
    "billing_pro_outcome": "For work that starts with your calendar.",
    "billing_pro_description": "Publish every event type. Connect the tools you use. Keep the booking page yours.",
    "billing_team_outcome": "For calendars that have to agree.",
    "billing_team_description": "Bring people, roles, and shared event types into one place. Each accepted member is one seat.",
    "billing_free_outcome": "For one clear way to be booked.",
    "billing_free_description": "Two active event types. One connected calendar. Convenio stays on the booking page.",
    "billing_pro_unlimited": "Publish without event-type limits",
    "billing_pro_calendar": "Check every connected calendar",
    "billing_pro_handoffs": "Carry confirmed bookings into your tools",
    "billing_team_scheduling": "Schedule as one team",
    "billing_team_roles": "Keep roles and handoffs clear",
    "billing_team_record": "Keep the booking history visible",
    "billing_choose_pro": "Choose Pro",
    "billing_choose_team": "Bring in the team",
    "billing_keep_working_free": "Keep working free",
    "billing_cancel_anytime": "No commitment · Cancel anytime",
    "billing_plan_proof": "One person or a team of fifty. The same scheduling record.",
    "billing_view_all_plans": "View all plans",
    "billing_all_plans_title": "Every way to use Convenio",
    "billing_all_plans_description": "The free plan stays available when the essentials are enough.",
    "billing_weekly_equivalent": "{{price}} per week when billed yearly"

Keep unused legacy translation keys unless repository-wide usage proves deletion safe.

- [ ] **Step 5: Run the focused test and formatter**

    TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx
    yarn biome check --write apps/web/modules/billing/PlanSelector.tsx apps/web/modules/billing/PlanSelector.test.tsx packages/i18n/locales/en/common.json

Expected: three tests PASS; Biome exits 0.

- [ ] **Step 6: Commit Task 1**

    git add apps/web/modules/billing/PlanSelector.tsx apps/web/modules/billing/PlanSelector.test.tsx packages/i18n/locales/en/common.json
    git commit -m "feat(billing): add Convenio plan selector"

### Task 2: Public and authenticated pricing wrappers

**Files:**
- Modify: apps/web/modules/billing/Pricing.tsx
- Modify: apps/web/modules/billing/Pricing.test.tsx

**Interfaces:**
- Consumes: PlanSelector, PaidSelection, MarketingHeader, MarketingFooter, getMarketingShellCopy, Shell, and viewer.billing.createCheckout.
- Produces: Pricing with public/app wrappers; PricingPage with unchanged authenticated Polar calls.

- [ ] **Step 1: Replace the old tests with wrapper/controller tests**

In apps/web/modules/billing/Pricing.test.tsx, hoist push, checkoutMutate, and a selectPlan callback captured from the mocked PlanSelector. Mock MarketingHeader as data-testid=marketing-header, Shell as data-testid=app-shell, and PlanSelector as:

    PlanSelector: (props: {
      freeHref: string;
      onSelectPlan(selection: PaidSelection): void;
    }) => {
      selectPlan = props.onSelectPlan;
      return <div data-testid="plan-selector" data-free-href={props.freeHref} />;
    }

Add these tests:

    it("renders marketing for an anonymous visitor", () => {
      const view = render(<Pricing isAuthenticated={false} onSelectPlan={vi.fn()} />);
      expect(view.getByTestId("marketing-header")).toBeInTheDocument();
      expect(view.getByTestId("plan-selector")).toHaveAttribute("data-free-href", "/signup");
    });

    it("renders the native shell for an authenticated visitor", () => {
      const view = render(<Pricing isAuthenticated onSelectPlan={vi.fn()} />);
      expect(view.getByTestId("app-shell")).toBeInTheDocument();
      expect(view.getByTestId("plan-selector")).toHaveAttribute("data-free-href", "/event-types");
    });

    it("preserves intent before sending an anonymous visitor to signup", () => {
      render(<PricingPage isAuthenticated={false} />);
      selectPlan({ interval: "YEAR", plan: "PRO" });
      expect(localStorage.getItem("onBoardingRedirect")).toBe("/pricing");
      expect(push).toHaveBeenCalledWith("/signup");
      expect(checkoutMutate).not.toHaveBeenCalled();
    });

    it("keeps Pro on the existing authenticated checkout mutation", () => {
      render(<PricingPage isAuthenticated />);
      selectPlan({ interval: "YEAR", plan: "PRO" });
      expect(checkoutMutate).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });
    });

Retain a Team test proving organizationId is included and a no-organization test proving the existing organization bootstrap URL is unchanged.

- [ ] **Step 2: Run the tests and verify failure**

    TZ=UTC yarn test apps/web/modules/billing/Pricing.test.tsx

Expected: FAIL because public/app wrappers and onboarding redirect persistence do not exist.

- [ ] **Step 3: Refactor Pricing without changing checkout semantics**

Delete the local plan catalog, static price map, interval state, blue/cyan decoration, and card rendering from Pricing.tsx. Import PlanSelector and PaidSelection from ./PlanSelector.

Authenticated rendering must be:

    <Shell
      eyebrow={t("billing_pricing_eyebrow")}
      heading={t("billing")}
      subtitle={t("billing_pricing_description")}>
      <PlanSelector
        freeHref="/event-types"
        onSelectPlan={onSelectPlan}
        pendingPlan={pendingPlan}
      />
    </Shell>

Anonymous rendering must be:

    const copy = getMarketingShellCopy(t);

    <div className="cv-root">
      <MarketingHeader copy={copy} current="pricing" />
      <main className="cv-container">
        <PlanSelector
          freeHref="/signup"
          onSelectPlan={onSelectPlan}
          pendingPlan={pendingPlan}
        />
      </main>
      <MarketingFooter copy={copy} />
    </div>

Keep the existing Team organization bootstrap branch. Change only the anonymous branch:

    if (!isAuthenticated) {
      localStorage.setItem("onBoardingRedirect", "/pricing");
      router.push("/signup");
      return;
    }

Keep checkout success exactly as a browser assignment to the returned checkoutUrl. Do not change tRPC schemas, handlers, Polar services, returnUrl, successUrl, or checkout validation.

- [ ] **Step 4: Run component tests and Biome**

    TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/billing/Pricing.test.tsx
    yarn biome check --write apps/web/modules/billing/Pricing.tsx apps/web/modules/billing/Pricing.test.tsx

Expected: all tests PASS; Biome exits 0.

- [ ] **Step 5: Commit Task 2**

    git add apps/web/modules/billing/Pricing.tsx apps/web/modules/billing/Pricing.test.tsx
    git commit -m "feat(billing): theme public and in-app pricing"

### Task 3: Marketing stylesheet and pricing navigation

**Files:**
- Modify: apps/web/app/layout.tsx
- Modify: apps/web/app/(marketing)/layout.tsx
- Modify: apps/web/app/(marketing)/MarketingShell.tsx
- Modify: apps/web/playwright/marketing.e2e.ts

**Interfaces:**
- Consumes: the existing .cv-root-scoped stylesheet and stable /pricing route.
- Produces: marketing styles available to /pricing and a Pricing navigation destination.

- [ ] **Step 1: Add the failing browser assertion**

Append to apps/web/playwright/marketing.e2e.ts:

    test("pricing uses the marketing shell and yearly-first hierarchy", async ({ page }) => {
      await page.goto("/pricing");

      await expect(page.locator(".cv-header")).toBeVisible();
      await expect(page.getByRole("link", { name: "Pricing" })).toHaveAttribute(
        "aria-current",
        "page"
      );
      await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Free" })).toHaveCount(0);
      await expect(page.getByText("$96")).toBeVisible();
    });

- [ ] **Step 2: Run the browser test and verify failure**

    PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/marketing.e2e.ts --project=@calcom/web --workers=1

Expected: FAIL because .cv-header and the Pricing navigation link are absent.

- [ ] **Step 3: Move the scoped stylesheet import to the root layout**

Add beside the existing globals import in apps/web/app/layout.tsx:

    import "./(marketing)/marketing.css";

Remove from apps/web/app/(marketing)/layout.tsx:

    import "./marketing.css";

The stylesheet remains scoped under .cv-root and therefore does not restyle authenticated routes.

- [ ] **Step 4: Add Pricing to the shared marketing shell**

Add pricing: t("pricing") to getMarketingShellCopy.

Change the current union to:

    current?: "products" | "manifesto" | "pricing";

Add this link after Products in MarketingHeader:

    <Link
      href="/pricing"
      className="cv-nav-link"
      aria-current={current === "pricing" ? "page" : undefined}>
      {copy.pricing}
    </Link>

Add the same link without aria-current to MarketingFooter.

- [ ] **Step 5: Run focused verification**

    yarn biome check --write apps/web/app/layout.tsx 'apps/web/app/(marketing)/layout.tsx' 'apps/web/app/(marketing)/MarketingShell.tsx' apps/web/playwright/marketing.e2e.ts
    TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/billing/Pricing.test.tsx
    PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/marketing.e2e.ts --project=@calcom/web --workers=1
    yarn type-check:ci --force

Expected: Biome exits 0; component and marketing tests PASS; the forced type-check exits 0 or a separately evidenced pre-existing error is reported without being silently dismissed.

- [ ] **Step 6: Commit Task 3**

    git add apps/web/app/layout.tsx 'apps/web/app/(marketing)/layout.tsx' 'apps/web/app/(marketing)/MarketingShell.tsx' apps/web/playwright/marketing.e2e.ts
    git commit -m "feat(marketing): connect pricing to the Convenio shell"

## Slice Completion Evidence

Before declaring the slice complete, prove each item from current source and test output:

- /pricing remains stable.
- Anonymous visitors see MarketingHeader/Footer and cannot start checkout before signup.
- onBoardingRedirect=/pricing survives either auth provider and is consumed by existing onboarding completion.
- Authenticated visitors see Shell and still call viewer.billing.createCheckout.
- Team without organizationId still routes through organization creation.
- Successful checkout still assigns the validated Polar URL.
- Yearly starts selected; Pro and Team are visible; Free appears only through the sheet.
- Rendered pricing has no blue/cyan colors, gradients, “Most popular,” or generic “unlock” copy.
- Light/dark, keyboard focus, 390px, and 1280px have been visually checked.
