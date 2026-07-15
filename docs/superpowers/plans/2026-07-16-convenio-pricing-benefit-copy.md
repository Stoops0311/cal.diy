# Convenio Pricing Benefit Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abstract Pro, Team, and Free pricing benefits with the approved capability-plus-outcome wording on every shared pricing surface.

**Architecture:** Keep the existing `PlanSelector` structure and translation keys unchanged. Update the English catalog values, add a catalog contract test for the exact approved strings, and make the component test render those strings so it also proves Pro and Team are visible while Free remains in “View all plans.”

**Tech Stack:** TypeScript, React, next-i18next catalog JSON, Vitest, Testing Library, Biome.

## Global Constraints

- Change only pricing benefit copy and its focused tests.
- Headlines, plan descriptions, prices, cadence, seat explanation, proof line, CTAs, ordering, checkout, Polar integration, entitlements, and feature gates remain unchanged.
- All user-facing strings remain in `packages/i18n/locales/en/common.json`.
- Do not add trials, discounts, urgency, popularity labels, or unsupported claims.
- Keep the existing translation keys so public pricing, authenticated pricing, upgrade prompts, and onboarding continue to share one source.

---

### Task 1: Replace and verify shared pricing benefit copy

**Files:**
- Modify: `apps/web/modules/billing/PlanSelector.test.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: the existing benefit keys in `PlanSelector.tsx`: `billing_pro_unlimited`, `billing_pro_calendar`, `billing_pro_handoffs`, `billing_team_scheduling`, `billing_team_roles`, `billing_team_record`, `billing_free_events`, `billing_free_calendar`, and `billing_free_branding`.
- Produces: exact English catalog values rendered by every existing `PlanSelector` context; no TypeScript interface changes.

- [ ] **Step 1: Add a failing catalog contract test**

Import the English catalog and add this test before the component tests:

```tsx
import common from "../../../../packages/i18n/locales/en/common.json";

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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
yarn workspace @calcom/web test --run apps/web/modules/billing/PlanSelector.test.tsx
```

Expected: FAIL because the current catalog still contains the abstract benefit lines.

- [ ] **Step 3: Replace only the nine catalog values**

Set the existing keys to these exact values:

```json
"billing_free_events": "2 active event types — Publish your two most useful booking links.",
"billing_free_calendar": "1 connected calendar — Keep availability tied to your main calendar.",
"billing_free_branding": "Convenio branding stays on the booking page.",
"billing_pro_unlimited": "Unlimited event types — Offer every kind of meeting you run.",
"billing_pro_calendar": "Connect every calendar — Only show times that are truly free.",
"billing_pro_handoffs": "Webhooks and API keys — Send confirmed bookings into the tools that act on them.",
"billing_team_scheduling": "Shared event types — Give the team one set of booking rules.",
"billing_team_roles": "Round-robin and collective scheduling — Find a time across the right people.",
"billing_team_record": "Roles and booking history — Control who can change things and see what happened."
```

- [ ] **Step 4: Make the component test render and assert the approved strings**

Extend the existing locale mock with the nine exact values, then add assertions to the yearly/default test for all six visible paid-plan lines. Extend the “reveals Free” test with assertions for all three Free lines. Do not change `PlanSelector.tsx`.

```tsx
expect(view.getByText("Unlimited event types — Offer every kind of meeting you run.")).toBeInTheDocument();
expect(view.getByText("Connect every calendar — Only show times that are truly free.")).toBeInTheDocument();
expect(
  view.getByText("Webhooks and API keys — Send confirmed bookings into the tools that act on them.")
).toBeInTheDocument();
expect(view.getByText("Shared event types — Give the team one set of booking rules.")).toBeInTheDocument();
expect(
  view.getByText("Round-robin and collective scheduling — Find a time across the right people.")
).toBeInTheDocument();
expect(
  view.getByText("Roles and booking history — Control who can change things and see what happened.")
).toBeInTheDocument();
```

- [ ] **Step 5: Run focused tests and formatting**

Run:

```bash
yarn workspace @calcom/web test --run apps/web/modules/billing/PlanSelector.test.tsx
yarn biome check --write apps/web/modules/billing/PlanSelector.test.tsx packages/i18n/locales/en/common.json
git diff --check
```

Expected: all `PlanSelector` tests pass, Biome exits successfully, and `git diff --check` prints no errors.

- [ ] **Step 6: Commit the copy slice**

```bash
git add apps/web/modules/billing/PlanSelector.test.tsx packages/i18n/locales/en/common.json
git commit -m "fix(billing): clarify pricing benefits"
```

- [ ] **Step 7: Verify the shared UI live**

At `http://localhost:3000/pricing`, verify at 1280×800 and 390×844:

- yearly remains selected by default;
- Pro and Team each show the three exact approved benefit lines;
- “View all plans” reveals Free with its three exact approved lines;
- the page has no horizontal overflow;
- the console has no new error caused by the copy change.
