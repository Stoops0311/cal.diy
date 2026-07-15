# Convenio Monetization UX Design

**Status:** Approved direction, written after the repository audit on 2026-07-16.

**Scope:** Plan selection, contextual upgrades, onboarding, authenticated billing visibility, organization invitations, dynamic seat communication, and public pricing. Polar checkout, webhook processing, entitlement decisions, and product configuration remain unchanged.

## Product Decision

Convenio uses the existing dynamic-seat model. An accepted organization member is a billed Polar seat. The interface shows accepted members against the current 50-member plan limit; it does not imply that customers pre-purchase unused seats. At the limit, owners must remove a member before inviting another. There is no invented add-seat checkout path.

The work ships as six reviewable slices built on one shared monetization presentation layer. This preserves the repository's 500-line and 10-code-file PR guidance while keeping copy, plan hierarchy, and checkout behavior consistent.

## Voice and Copy System

Billing is part of the Convenio product, not a generic SaaS sales surface. All new and revised strings follow `PRODUCT.md`, `DESIGN.md`, and the approved brand voice:

- Short, declarative sentences.
- Outcome before inventory.
- Calendar, team, and agreement language only where it clarifies the task.
- No “unlock,” “supercharge,” “empower,” “seamless,” “most popular,” or unsupported urgency.
- No fabricated customer counts, testimonials, adoption claims, or savings claims.
- Buttons name the action: “Choose Pro ›”, “Bring in the team ›”, “Keep working free”, “Manage plan”.
- “No commitment · Cancel anytime” sits next to paid actions.
- Exact prices and trial claims come from the existing plan configuration shown by the product. Copy must not promise a trial or discount unless the configured Polar product supports it.

### Core paywall copy

**Eyebrow:** `PLANS FOR THE WORK`

**Title:** `One calendar. Or every calendar in the room.`

**Introduction:** `Choose the way you schedule now. Convenio keeps the handoff to payment brief, then brings you back to the work.`

**Pro**

- Outcome: `For work that starts with your calendar.`
- Support: `Publish every event type. Connect the tools you use. Keep the booking page yours.`
- CTA: `Choose Pro ›`

**Team**

- Outcome: `For calendars that have to agree.`
- Support: `Bring people, roles, and shared event types into one place. Each accepted member is one seat.`
- CTA: `Bring in the team ›`

**Free**, shown behind “View all plans” or as the onboarding skip path

- Outcome: `For one clear way to be booked.`
- Support: `Two active event types. One connected calendar. Convenio stays on the booking page.`
- CTA: `Keep working free`

The proof line uses verifiable product scope rather than fabricated social proof: `One person or a team of fifty. The same scheduling record.` This is capability evidence, not an adoption claim.

### Contextual gate grammar

The prompt names the attempted capability and states the plan relationship without generic upgrade language:

- Eyebrow: `PRO` or `TEAM`
- Title pattern: `{Feature} belongs in {plan}.`
- Body pattern: one outcome sentence specific to the attempted action.
- Primary CTA: `Choose {plan} ›`
- Secondary CTA: `Not now`

Examples:

- `Booking history belongs in Team.` / `Keep the decisions behind every booking visible to the people responsible for it.`
- `Outgoing webhooks belong in Pro.` / `Carry a confirmed booking into the systems that act on it.`
- `Another calendar belongs in Pro.` / `Check every calendar that can change whether a time holds.`

## Shared Architecture

### Plan presentation

Create a billing-owned presentation layer under `apps/web/modules/billing/components/`:

- `PlanSelector.tsx` owns yearly-first interval state, the two primary paid plans, exact price formatting, CTA states, and the “View all plans” sheet.
- `PlanCard.tsx` renders one token-based plan without checkout knowledge.
- `PlanProof.tsx` renders the factual proof line and cancellation reassurance.
- `PublicPricing.tsx`, `InAppPlanSelection.tsx`, `OnboardingPlanStep.tsx`, and `UpgradePrompt.tsx` are thin context wrappers around `PlanSelector`.

`Pricing.tsx` remains the checkout controller. It accepts a selected plan and calls the existing `viewer.billing.createCheckout` mutation. No presentation component imports Polar services or duplicates plan status.

The existing `/pricing` route stays stable. It renders the public marketing treatment for anonymous visitors and the native app treatment for authenticated users. Public paid CTAs first send an anonymous visitor through signup with a safe callback to `/pricing`; only an authenticated selection starts checkout.

### Upgrade intent

`UpgradePromptProvider` is mounted once in the authenticated shell. Consumers call:

```ts
openUpgradePrompt({
  capability: "bookingAudit",
  featureName: t("booking_history"),
  requiredPlan: "TEAM",
  returnTo: currentRelativeUrl,
  resume: { kind: "openBookingAudit", bookingUid },
});
```

The provider owns the sheet/dialog and never owns entitlement logic. Each feature gate still uses its existing entitlement result; it merely replaces navigation, an empty lock badge, or a generic failure with a consistent prompt.

Before leaving for Polar, the client writes a versioned upgrade intent to `sessionStorage`. Only same-origin relative paths and an allowlisted resume shape are accepted. No arbitrary URL or executable callback is persisted.

Polar continues returning successful checkout to `/settings/billing?checkout_id=…`. After the existing reconciliation confirms an active plan, the billing client consumes the stored intent and returns to the original route with a small success marker. Safe actions such as reopening a sheet may resume automatically; destructive or state-changing actions remain one tap away.

Canceling or backing out of Polar returns to the current `/pricing` path. The stored intent remains available for the session but expires after 30 minutes and is cleared after a successful restore.

### Billing summary

Add a safe `viewer.billing.summary` read model. It composes, rather than replaces, the Polar-backed subscription projection:

- effective plan and active status from the existing Polar subscription projection;
- management permission from accepted organization role;
- `acceptedSeats` from accepted memberships;
- `seatLimit` from the existing Team entitlement limit;
- billed quantity from the Polar projection for settings detail only.

The endpoint never returns provider customer IDs, subscription IDs, credential material, or `credential.key`. Ordinary accepted members may read the non-sensitive organization summary; only owners/admins receive management affordances.

`BillingStatusWidget` mounts beside the authenticated shell content, not inside Dock navigation. It shows `Free`, `Pro`, or `Team`; Team adds `{used} of {limit} seats in use`. Owners see `Manage plan`; free users see `Compare plans`.

## Workstream Design

### 1. Native plan selection

Replace hard-coded blue/cyan pricing styles with shared Convenio tokens and UI components. The surface uses the app masthead, flat planes, hairlines, Archivo headings, mono eyebrows, and inverted pill actions. Yearly is selected initially. Pro and Team are visible; Free lives in the “View all plans” sheet and remains available as the non-blocking path.

Price anchoring may show the exact annual price and a mathematically derived weekly equivalent. It must label the billing cadence clearly and avoid false savings language.

### 2. Contextual upgrades

Start with every active enforced gate identified by the audit: booking audit, event creation/update limits, API keys, outgoing webhooks, calendar limits, branding, and organization/member actions. Stubbed UI gates are wired only when they correspond to an existing entitlement; no new entitlement rules are invented.

Server-side `FORBIDDEN` remains the enforcement boundary. A client mutation may map a known capability failure back to the same prompt, but it must not infer a plan from an arbitrary forbidden error.

### 3. Onboarding

The first step asks what the person is doing:

- `I work on my own`
- `I am joining a team`
- `I am bringing a team`

This intent is separate from billing plan state.

Solo continues through personal setup. An accepted organization member follows the join-team variant and sees their team context. A person without an accepted membership is told to use the invitation link from their email and can continue solo; Convenio does not pretend it can discover a pending invitation from Prisma.

Create-team uses the existing Clerk-backed organization creation command, then exposes the shared invitation panel. The final onboarding route recaps the completed setup and presents the appropriate plan treatment. “Keep working free” completes onboarding and never blocks access.

### 4. Dashboard plan status

The authenticated shell always shows the effective plan summary. Team members see team seat usage; only billing managers see management actions. Loading uses a quiet tokenized skeleton. Failure omits billing actions and provides a retry without blocking the rest of the application.

### 5. Invitations and seats

Add the missing organization members settings route. The panel lists accepted members from the local projection and pending invitations from Clerk. Owner/admin actions use existing organization commands for invites, roles, and removals; pending resend/revoke operations extend the Clerk gateway without creating a second invitation store.

Seat copy is explicit: `4 of 50 seats in use` and `An accepted invitation adds one billed seat.` At 50, invitation submission is disabled with `This team is full. Remove a member before inviting another.` No add-seat button is shown because no higher-capacity product or checkout exists.

The same invitation panel appears after create-team onboarding and is linked from the billing widget.

### 6. Public pricing

Anonymous `/pricing` uses the existing marketing header, footer, typography, and monochrome CSS vocabulary. It shares the plan data and cards with the app treatment but adds public framing and the weekly price breakdown. Marketing navigation gains a Pricing link.

The purchase path is:

`public pricing → signup → authenticated /pricing → Polar hosted checkout → billing reconciliation → original app context`

## Error and State Design

- Checkout errors stay on the current surface and use the existing error toast translated into Convenio copy: `Payment did not open. Try again.`
- A stale or malformed return intent is discarded and the user remains on billing settings.
- A plan that becomes active while reconciliation is pending shows `Polar is confirming the change.`
- Invitation duplication, invalid email, permission failure, full team, and Clerk failure receive distinct inline messages.
- Pending invitations never count as used or billed seats.
- Accepted membership is projected only after the existing seat synchronization succeeds.
- All sheets and dialogs restore focus, close on Escape, meet 44px coarse-pointer targets, and respect reduced motion.

## Verification

Each slice starts with focused tests and ends with its own review gate.

- Component tests: yearly default, two visible plans, “View all plans,” action-specific CTAs, exact copy, keyboard behavior, and both public/app wrappers.
- Intent tests: same-origin validation, expiry, consumption, safe resume shapes, canceled checkout retention, and successful return cleanup.
- Billing summary tests: personal plan, organization Team plan, ordinary-member visibility, owner management permission, accepted/limit counts, and no provider identifiers.
- Onboarding tests: all three intents, existing member routing, missing invite recovery, create-team flow, premium skip, and completion.
- Invitation tests: pending/accepted lists, duplicate invite, resend/revoke, role permissions, last-owner protection, dynamic seat copy, and the 50-member boundary.
- E2E: anonymous pricing through signup, Pro checkout return, Team creation/invitation, contextual upgrade return, onboarding skip, and dashboard status.
- Visual checks: light/dark, 1280px/390px, keyboard, reduced motion, long translations, and no blue/cyan/gradient residue.
- Final commands: Biome on changed files, focused Vitest/Playwright suites, then `yarn type-check:ci --force`.

## Delivery Slices

1. Shared plan presentation, copy, and public/authenticated `/pricing` treatments.
2. Upgrade intent provider, checkout return restoration, and active gate migration.
3. Safe billing summary and authenticated status widget.
4. Onboarding intent model and skippable premium completion.
5. Organization members route, Clerk pending invitations, and dynamic seat communication.
6. Full gate ledger, public purchase E2E, accessibility, and regression verification.

Every slice preserves the current checkout mutation, Polar hosted card entry, subscription projection, webhooks, and entitlement enforcement.
