# Convenio UI Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Convenio's shared visual grammar, correct the audited public/auth defects, and create reusable foundations for the remaining route-by-route and modal audit.

**Architecture:** Keep the existing Cal.diy component APIs intact while changing their shared tokens, typography, surface hierarchy, and branded shells. Work in small slices: public marketing, auth/onboarding, shared dialogs, booking surfaces, then authenticated route families. Every slice is browser-verified in both themes and at desktop/mobile widths before moving on.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, CSS custom properties, Vitest, Playwright.

## Global Constraints

- Preserve the approved monochrome Convenio brand brief and manifesto voice.
- Use existing dependencies; do not add packages.
- Preserve all user-authored uncommitted changes and avoid generated files.
- Keep each implementation slice below 10 code files and 500 changed code lines where practical.
- Add every new UI string to `packages/i18n/locales/en/common.json`.
- Meet WCAG 2.2 AA, keyboard, reduced-motion, and mobile requirements.
- Run Biome, relevant tests, and `yarn type-check:ci --force` before completion.

---

### Task 1: Marketing layout invariants

**Files:**
- Create: `apps/web/playwright/marketing.e2e.ts`
- Modify: `apps/web/app/(marketing)/marketing.css`

**Interfaces:**
- Consumes: `.cv-container`, `.cv-hero`, `.cv-page-hero`, and `.cv-header-inner` from the existing marketing system.
- Produces: responsive marketing gutters that remain at least 24px at tablet widths and 20px on mobile.

- [ ] **Step 1: Write the failing gutter test**

```ts
import { expect } from "@playwright/test";

import { test } from "./lib/fixtures";

test("marketing heroes retain viewport gutters", async ({ page }) => {
  await page.setViewportSize({ width: 996, height: 918 });
  await page.goto("/");

  const hero = page.locator(".cv-hero");
  await expect(hero).toBeVisible();
  await expect.poll(async () => (await hero.boundingBox())?.x ?? 0).toBeGreaterThanOrEqual(24);
});
```

- [ ] **Step 2: Run the test and confirm the current CSS fails**

Run: `PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/marketing.e2e.ts --project=@calcom/web --workers=1`

Expected: FAIL because `.cv-hero { padding: 96px 0 80px; }` overwrites `.cv-container` horizontal padding and places the hero at `x = 0` near the tablet breakpoint.

- [ ] **Step 3: Preserve gutters while keeping vertical rhythm**

```css
.cv-hero {
  padding-top: 96px;
  padding-bottom: 80px;
}

.cv-page-hero {
  padding-top: 112px;
  padding-bottom: 80px;
}
```

Add mobile-specific vertical rhythm without overriding the shared inline padding.

- [ ] **Step 4: Run the focused test and browser-check `/`, `/products`, and `/manifesto`**

Expected: PASS; every page keeps horizontal gutters and no horizontal overflow at 996px and 390px.

### Task 2: Convenio typography roles

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/styles/globals.css`
- Modify: `apps/web/app/(marketing)/marketing.css`

**Interfaces:**
- Produces: `--font-sans`, `--font-cal`, and `--font-mono` with explicit product, display, and metadata roles.

- [ ] Replace the generic metadata face with Azeret Mono through `next/font/google`, preserving the existing `--font-mono` API.
- [ ] Scope Archivo weight/tracking to display roles; do not force display tracking onto ordinary product labels.
- [ ] Verify font loading, fallback behavior, and layout shift in the browser.

### Task 3: Shared dialog hierarchy

**Files:**
- Modify: `packages/ui/components/dialog/Dialog.tsx`
- Modify: `packages/config/theme/tokens.css`
- Test: `packages/ui/components/dialog/Dialog.test.tsx`

**Interfaces:**
- Produces: one consistent title plane, content plane, and action plane for all existing dialogs without changing dialog props.

- [ ] Add a failing component test for the dialog surface and focus contract.
- [ ] Introduce a raised monochrome dialog surface token with light/dark mirror values.
- [ ] Ensure destructive dialogs keep semantic red and first-run dialogs cannot visually merge with the canvas.
- [ ] Verify new-event, new-schedule, date-override, timezone, and delete-account dialogs.

### Task 4: Auth and onboarding accessibility

**Files:**
- Modify: `apps/web/modules/signup-view.tsx`
- Modify: `apps/web/modules/auth/components/AuthShell.tsx`
- Modify: `apps/web/modules/auth/verify-email-view.tsx`
- Modify: `apps/web/modules/shell/components/WelcomeToCalcomModal.tsx`
- Test: `apps/web/modules/signup-view.test.tsx`

**Interfaces:**
- Produces: programmatic field labels, Convenio verification hierarchy, and deterministic first-run modal sequencing.

- [ ] Add failing tests for labelled email/password controls and one-modal-at-a-time first-run behavior.
- [ ] Associate labels with their controls and retain existing form APIs.
- [ ] Replace the generic verification card with the shared auth/convergence shell.
- [ ] Sequence timezone and welcome prompts instead of stacking equal-z-index dialogs.
- [ ] Re-run signup and onboarding end to end with MailHog.

### Task 5: Booking and authenticated convergence planes

**Files:**
- Modify only the smallest shared wrapper files identified by the live audit for booking profile, Booker, app shell, and settings shell.
- Add focused tests beside each changed wrapper.

**Interfaces:**
- Produces: paired host/guest planes on booking surfaces and a distinct navigation/work canvas in the authenticated app.

- [ ] Replace generic public-profile card stacks with structured host terms and event choices.
- [ ] Give booking selection and confirmation screens paired host/guest surfaces without changing booking behavior.
- [ ] Apply the shared navigation plane and active-state vocabulary across Event types, Bookings, Availability, Apps, and Settings.
- [ ] Audit all reachable empty, loading, error, success, disabled, menu, popover, sheet, and modal states.

### Task 6: Exhaustive copy and verification pass

**Files:**
- Modify: `packages/i18n/locales/en/common.json`
- Modify only source files that still render Cal.diy/Cal.com brand copy or links in Convenio-owned UI.

**Interfaces:**
- Produces: an auditable route/modal ledger and zero unintended Cal.diy brand residue in reachable Convenio UI.

- [ ] Search rendered and source UI for `Cal.diy`, `Cal.com`, `Calcom`, old support links, and generic marketing verbs.
- [ ] Preserve third-party legal names and API compatibility identifiers where renaming would be false or breaking.
- [ ] Browser-verify every reachable route family and modal in light, dark, 1280px, and 390px modes.
- [ ] Run Biome on changed files, relevant unit/E2E tests, and `yarn type-check:ci --force`.
