# Convenio Contextual Gate Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Convenio’s contextual paid-plan prompt at every audited billing gate while keeping server authorization authoritative, preserving safe return-to-feature behavior, and using the approved Convenio wording.

**Architecture:** Server entitlement failures are converted into one allowlisted `EntitlementDenial` union and transported through tRPC or the calendar REST endpoint. Client boundaries parse only that union and open the existing upgrade prompt; ordinary `FORBIDDEN`, provider failures, and message text never trigger checkout. The prompt remains a shell-level UI service, while app-store code emits a billing-agnostic calendar-denial event that the web shell adapts. State-changing mutation inputs, API secrets, and webhook secrets are never persisted or replayed.

**Tech Stack:** TypeScript, React, Next.js, tRPC, TanStack Query, Vitest, Testing Library, next-i18next, Biome, Yarn/Turbo.

**Approved design:** [`docs/superpowers/specs/2026-07-16-convenio-monetization-ux-design.md`](../specs/2026-07-16-convenio-monetization-ux-design.md). This plan implements that design; it does not reopen visual or copy direction.

**Baseline:** `3f462343a5`

## Global constraints

- Keep `assertEntitled` and `assertWithinLimit` as the source of truth. A client prompt is a response to an authoritative denial, not a replacement for it.
- Never open checkout from a generic `FORBIDDEN`, `UNAUTHORIZED`, HTTP status, thrown message, toast text, provider error, or substring match.
- Transport only allowlisted entitlement fields. Never serialize an arbitrary tRPC `cause` or arbitrary error `.data`.
- Preserve the existing `organizationInvitations` upgrade-intent variant and its exact organization subject/resume-ID binding. Do not replace it with a generic resume variant.
- Add only a no-payload `{ kind: "returnToFeature" }` resume for new gates. The validated `returnTo` route reopens the relevant surface; it never resubmits a mutation.
- Keep organization invitation eligibility exactly `data.canManageInvitations && !isFull`. The contextual prompt is allowed only for an invitation manager whose Team subscription is inactive. A full 50-seat organization does not receive an upgrade prompt.
- Use translation keys in `packages/i18n/locales/en/common.json`; no new user-facing inline English.
- Every task below is below 500 changed code lines and touches at most 10 code files. If a task crosses either limit, stop and split it before continuing.
- After each task: run its focused tests, Biome on its changed files, `yarn type-check:ci --force`, `git diff --check`, and the task’s size check before committing.
- Do not change checkout internals or `usePaidPlanCheckout` behavior.

## Shared contracts and copy

Create this server/client-safe union in Task 1:

```ts
export type EntitlementDenial =
  | {
      kind: "capability";
      capability: EntitlementCapability;
      effectivePlan: PlanKeyType;
    }
  | {
      kind: "limit";
      resource: EntitlementLimit;
      currentCount: number;
      limit: number;
      effectivePlan: PlanKeyType;
    };
```

The prompt copy must resolve from an allowlisted client map, never from server-provided prose:

| Gate key | Feature name | Body | Required plan |
| --- | --- | --- | --- |
| `activePersonalEventTypes` | Another event type | Publish another way to meet without taking an existing link offline. | Pro |
| `canCreateTeamEvents` | Shared event types | Put the people, roles, and availability behind one team link. | Team |
| `canUseCollectiveScheduling` | Collective scheduling | Offer times only when every required calendar can hold them. | Team |
| `canUseRoundRobinScheduling` | Round-robin scheduling | Distribute meetings while the team keeps one booking record. | Team |
| `canUseRecurringEvents` | Recurring meetings | State the cadence once and keep every occurrence together. | Pro or Team from context |
| `canUsePrivateLinks` | Private links | Share specific terms without publishing another public event type. | Pro or Team from context |
| `canUseCustomRedirects` | Booking redirects | Carry a confirmed booking to the next step. | Pro or Team from context |
| `canUseCustomBookingFields` | Custom booking questions | Collect the terms needed before the meeting is agreed. | Pro or Team from context |
| `canUseBookingPayments` | Booking payments | Collect payment as part of the booking terms. | Pro or Team from context |
| `canUseAdvancedEvents` | Advanced event terms | Set buffers, limits, and seat rules around the meeting. | Pro or Team from context |
| `canCreateApiKeys` | API keys | Let your systems act on the scheduling record. | Pro or Team from context |
| `canCreateWebhooks` | Webhooks | Send confirmed bookings into the tools that act on them. | Pro or Team from context |
| `connectedCalendars` | Another calendar | Check every calendar that can change whether a time holds. | Pro or Team from context |
| `canRemoveBranding` | A booking page without Convenio | Keep the booking page yours. | Pro |
| `organizationInvitations` | Team invitations | Bring people, roles, and shared event types into one place. | Team |

All titles use `{{feature}} belongs in {{plan}}.`. Buttons are `Choose Pro`, `Bring in the team`, and `Not now`; `PlanSelector` owns the chevron.

---

## Task 1: Transport only allowlisted entitlement denials

**Scope:** 4 code files, expected under 220 changed lines.

**Files:**

- Create: `packages/features/billing/lib/entitlementDenial.ts`
- Create: `packages/features/billing/lib/entitlementDenial.test.ts`
- Modify: `packages/trpc/server/errorFormatter.ts`
- Modify: `packages/trpc/server/errorFormatter.test.ts`

- [ ] Write failing unit cases for `entitlementDenial.ts`. Cover a valid capability denial, a valid limit denial, unknown capabilities/resources/plans, missing numeric fields, extra provider data, generic `FORBIDDEN`, `UNAUTHORIZED`, and arbitrary messages. The public functions are:

  ```ts
  export function getEntitlementDenialFromError(error: unknown): EntitlementDenial | null;
  export function parseEntitlementDenial(value: unknown): EntitlementDenial | null;
  ```

  `getEntitlementDenialFromError` may recognize only `ErrorWithCode` values whose code and exact `.data` shape match the two entitlement forms. `parseEntitlementDenial` must use exact-key validation and return a fresh object.

- [ ] Add formatter tests proving `shape.data.entitlement` appears for the two valid domain denials and is absent for a plain `TRPCError({ code: "FORBIDDEN" })`, `UNAUTHORIZED`, malformed cause data, and a provider error whose message resembles an entitlement error.

- [ ] Run the RED tests and confirm failures are missing module/export/assertions rather than harness failures:

  ```bash
  TZ=UTC yarn test packages/features/billing/lib/entitlementDenial.test.ts packages/trpc/server/errorFormatter.test.ts
  ```

- [ ] Implement the union and exact validators. Reuse exported entitlement capability/limit and plan constants from their source modules; do not duplicate free-form string arrays. The formatter change must be limited to:

  ```ts
  const entitlement = getEntitlementDenialFromError(error.cause);

  return {
    ...shape,
    data: {
      ...shape.data,
      ...(entitlement ? { entitlement } : {}),
    },
  };
  ```

  If the formatter receives the original error rather than its cause in the current callback signature, pass the original error to the helper and let the helper unwrap only the known `ErrorWithCode` cause. Do not expose any other cause fields.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test packages/features/billing/lib/entitlementDenial.test.ts packages/trpc/server/errorFormatter.test.ts
  yarn biome check --write packages/features/billing/lib/entitlementDenial.ts packages/features/billing/lib/entitlementDenial.test.ts packages/trpc/server/errorFormatter.ts packages/trpc/server/errorFormatter.test.ts
  yarn type-check:ci --force
  git diff --check
  git diff --stat 3f462343a5 -- packages/features/billing/lib/entitlementDenial.ts packages/features/billing/lib/entitlementDenial.test.ts packages/trpc/server/errorFormatter.ts packages/trpc/server/errorFormatter.test.ts
  ```

- [ ] Commit only these files:

  ```bash
  git add packages/features/billing/lib/entitlementDenial.ts packages/features/billing/lib/entitlementDenial.test.ts packages/trpc/server/errorFormatter.ts packages/trpc/server/errorFormatter.test.ts
  git commit -m "feat(billing): expose structured entitlement denials"
  ```

## Task 2: Generalize the prompt without weakening upgrade intents

**Scope:** 7 files (6 code files and 1 locale file), expected under 420 changed lines.

**Files:**

- Modify: `apps/web/modules/billing/upgradeIntent.ts`
- Modify: `apps/web/modules/billing/upgradeIntent.test.ts`
- Modify: `apps/web/modules/billing/UpgradePromptProvider.tsx`
- Modify: `apps/web/modules/billing/UpgradePromptProvider.test.tsx`
- Create: `apps/web/modules/billing/useEntitlementUpgrade.ts`
- Create: `apps/web/modules/billing/useEntitlementUpgrade.test.tsx`
- Modify: `packages/i18n/locales/en/common.json`

- [ ] Extend intent tests first. Add `{ kind: "returnToFeature" }` as a resume option for contextual gates and prove it survives serialization/parsing for allowlisted capabilities. Retain all existing tests for:

  ```ts
  {
    capability: "organizationInvitations";
    requiredPlan: "TEAM";
    subject: { kind: "organization"; organizationId: number };
    resume: { kind: "openOrganizationInvitations"; organizationId: number };
  }
  ```

  Add negative tests showing a mismatched organization ID, user subject, non-Team plan, or `returnToFeature` resume is rejected for `organizationInvitations`. Keep `bindUpgradeIntentToOrganization` limited to the existing booking-audit Team conversion.

- [ ] Add provider tests for the exact title/body/button grammar, Pro and Team plans, dismissal, checkout success return, and the existing invitation prompt. Assert `PlanSelector` supplies the chevron so translation text contains no chevron.

- [ ] Add hook tests around this interface:

  ```ts
  type EntitlementUpgradeContext = {
    returnTo: string;
    teamId?: number;
    organizationId?: number;
  };

  export function useEntitlementUpgrade(): {
    openFromError(error: unknown, context: EntitlementUpgradeContext): boolean;
    openFromDenial(denial: EntitlementDenial, context: EntitlementUpgradeContext): boolean;
  };
  ```

  `openFromError` parses `error.data.entitlement` and returns `false` for every non-allowlisted error. `openFromDenial` maps capability/resource plus context to the approved copy and safe required plan, opens the provider, and returns `true`. A Team-scoped denial must not silently become Pro. Unknown denial/context combinations return `false`.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/useEntitlementUpgrade.test.tsx
  ```

- [ ] Implement the generic resume, prompt body field, translation keys, and allowlisted denial-to-copy map. Derive plan as Team for an explicit team/organization context; otherwise Pro. Keep the special invitation construction on its existing `organizationInvitations`/`openOrganizationInvitations` path.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/useEntitlementUpgrade.test.tsx
  yarn biome check --write apps/web/modules/billing/upgradeIntent.ts apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/UpgradePromptProvider.tsx apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/useEntitlementUpgrade.ts apps/web/modules/billing/useEntitlementUpgrade.test.tsx packages/i18n/locales/en/common.json
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit:

  ```bash
  git add apps/web/modules/billing/upgradeIntent.ts apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/UpgradePromptProvider.tsx apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/useEntitlementUpgrade.ts apps/web/modules/billing/useEntitlementUpgrade.test.tsx packages/i18n/locales/en/common.json
  git commit -m "feat(billing): generalize contextual upgrade prompts"
  ```

## Task 3: Adopt prompts at event creation and unhide boundaries

**Scope:** 4 code files, expected under 300 changed lines.

**Files:**

- Modify: `apps/web/modules/event-types/hooks/useCreateEventType.ts`
- Create: `apps/web/modules/event-types/hooks/useCreateEventType.test.tsx`
- Modify: `apps/web/modules/event-types/views/event-types-listing-view.tsx`
- Create: `apps/web/modules/event-types/views/event-types-listing-view.test.tsx`

- [ ] In hook tests, reject create with structured denials for `activePersonalEventTypes`, `canCreateTeamEvents`, `canUseCollectiveScheduling`, `canUseRoundRobinScheduling`, and `canUseAdvancedEvents`. Assert the mapped prompt opens and the existing generic error toast does not. Reject with plain `FORBIDDEN` and assert no prompt and the existing error handling remains.

- [ ] In listing tests, reject `eventTypesHeavy.update` while unhiding with personal-limit and team-capability denials. Assert prompt selection uses the event’s scope and `returnTo` is the current listing URL. Assert the optimistic hidden state is restored. A plain `FORBIDDEN` must restore state and use the existing toast only.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test apps/web/modules/event-types/hooks/useCreateEventType.test.tsx apps/web/modules/event-types/views/event-types-listing-view.test.tsx
  ```

- [ ] Call `openFromError(error, { returnTo, teamId })` at each mutation error boundary before the existing toast. Use an early return only when it returns `true`. For create, retain `?dialog=new` and existing team/type query parameters so checkout return reopens the form; never cache or resubmit form values.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test apps/web/modules/event-types/hooks/useCreateEventType.test.tsx apps/web/modules/event-types/views/event-types-listing-view.test.tsx
  yarn biome check --write apps/web/modules/event-types/hooks/useCreateEventType.ts apps/web/modules/event-types/hooks/useCreateEventType.test.tsx apps/web/modules/event-types/views/event-types-listing-view.tsx apps/web/modules/event-types/views/event-types-listing-view.test.tsx
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(event-types): prompt on creation entitlement denials"` after staging only the four files above.

## Task 4: Adopt prompts at paid event-setting updates

**Scope:** 2 code files, expected under 260 changed lines.

**Files:**

- Modify: `apps/web/modules/event-types/components/EventTypeWebWrapper.tsx`
- Create: `apps/web/modules/event-types/components/EventTypeWebWrapper.entitlements.test.tsx`

- [ ] Add parameterized failing tests for the update mutation’s structured denials: team events, collective, round-robin, recurring, private links, redirects, custom booking fields, booking payments, advanced event terms, and personal active limit when unhiding. Assert exact feature copy, Pro/Team scope, current event/tab `returnTo`, and no automatic retry. Add one plain-`FORBIDDEN` control that keeps existing error handling.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test apps/web/modules/event-types/components/EventTypeWebWrapper.entitlements.test.tsx
  ```

- [ ] In the update mutation error callback, invoke the shared hook once with the event’s team context and exact route. Do not inspect changed form fields to infer an entitlement and do not use message matching; the server denial identifies the gate.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test apps/web/modules/event-types/components/EventTypeWebWrapper.entitlements.test.tsx
  yarn biome check --write apps/web/modules/event-types/components/EventTypeWebWrapper.tsx apps/web/modules/event-types/components/EventTypeWebWrapper.entitlements.test.tsx
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(event-types): prompt on paid event settings"` after staging only these two files.

## Task 5: Adopt prompts for API keys and webhooks

**Scope:** 6 code files, expected under 390 changed lines.

**Files:**

- Modify: `apps/web/modules/api-keys/api-keys/components/ApiKeyDialogForm.tsx`
- Create: `apps/web/modules/api-keys/api-keys/components/ApiKeyDialogForm.test.tsx`
- Modify: `apps/web/modules/event-types/components/tabs/webhooks/EventWebhooksTab.tsx`
- Create: `apps/web/modules/event-types/components/tabs/webhooks/EventWebhooksTab.entitlements.test.tsx`
- Modify: `apps/web/modules/webhooks/views/webhook-new-view.tsx`
- Create: `apps/web/modules/webhooks/views/webhook-new-view.entitlements.test.tsx`

- [ ] Add RED tests for structured `canCreateApiKeys` and `canCreateWebhooks` errors. API key tests must cover personal Pro and organization/team Team scope. Webhook tests must cover event-tab, user-level new webhook, and explicit team webhook routes. Assert entered API key/webhook values and secrets are not added to the upgrade intent or browser storage. Plain `FORBIDDEN` remains a normal error.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test apps/web/modules/api-keys/api-keys/components/ApiKeyDialogForm.test.tsx apps/web/modules/event-types/components/tabs/webhooks/EventWebhooksTab.entitlements.test.tsx apps/web/modules/webhooks/views/webhook-new-view.entitlements.test.tsx
  ```

- [ ] Route each mutation rejection through `openFromError` before its current toast. Use exact API-key/webhook return routes; checkout return may reopen the dialog/page but must not retry creation.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test apps/web/modules/api-keys/api-keys/components/ApiKeyDialogForm.test.tsx apps/web/modules/event-types/components/tabs/webhooks/EventWebhooksTab.entitlements.test.tsx apps/web/modules/webhooks/views/webhook-new-view.entitlements.test.tsx
  yarn biome check --write apps/web/modules/api-keys/api-keys/components/ApiKeyDialogForm.tsx apps/web/modules/api-keys/api-keys/components/ApiKeyDialogForm.test.tsx apps/web/modules/event-types/components/tabs/webhooks/EventWebhooksTab.tsx apps/web/modules/event-types/components/tabs/webhooks/EventWebhooksTab.entitlements.test.tsx apps/web/modules/webhooks/views/webhook-new-view.tsx apps/web/modules/webhooks/views/webhook-new-view.entitlements.test.tsx
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(developer): add contextual paid-plan prompts"` after staging only the six files above.

## Task 6: Let the branding toggle receive an authoritative denial

**Scope:** 2 code files, expected under 220 changed lines.

**Files:**

- Modify: `apps/web/modules/settings/my-account/appearance-view.tsx`
- Create: `apps/web/modules/settings/my-account/appearance-view.entitlements.test.tsx`

- [ ] Add tests proving a free user can attempt the remove-branding toggle, `me.updateProfile` remains the authority, a structured `canRemoveBranding` denial restores the previous toggle state and opens Pro copy, and a generic error restores state and shows the existing toast without checkout. Paid-user success remains unchanged.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test apps/web/modules/settings/my-account/appearance-view.entitlements.test.tsx
  ```

- [ ] Remove only the client-side disabled condition that prevents the authoritative attempt. On structured denial, restore the controlled form value before opening the prompt with the Appearance route. Do not optimistically claim branding was removed.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test apps/web/modules/settings/my-account/appearance-view.entitlements.test.tsx
  yarn biome check --write apps/web/modules/settings/my-account/appearance-view.tsx apps/web/modules/settings/my-account/appearance-view.entitlements.test.tsx
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(settings): prompt when removing branding"` after staging only these two files.

## Task 7: Connect inactive-Team invitation state to the existing intent

**Scope:** 4 code files, expected under 300 changed lines.

**Files:**

- Modify: `packages/trpc/server/routers/viewer/organizations/organizations.handler.ts`
- Modify: `packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts`
- Modify: `apps/web/modules/organizations/OrganizationMembersPanel.tsx`
- Modify: `apps/web/modules/organizations/OrganizationMembersPanel.test.tsx`

- [ ] Add handler tests for a new read-model field:

  ```ts
  invitationDenial:
    | {
        capability: "organizationInvitations";
        requiredPlan: "TEAM";
      }
    | null;
  ```

  It is non-null only when the viewer can manage invitations, the organization’s Team subscription is inactive, and the organization is below the fixed 50-seat limit. It is null for non-managers, active Team, and full organizations.

- [ ] Add panel tests preserving `const canInvite = data.canManageInvitations && !isFull;`. For the one inactive-Team denial state, the invite action opens the existing `organizationInvitations` intent with matching organization subject ID and `openOrganizationInvitations.organizationId`. A full organization continues to show capacity/remove-member guidance and never opens checkout.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
  ```

- [ ] Add the narrowly typed read-model field and branch the invite action on it. This is the deliberate safe exception to mutation-error-only adoption: inactive Team currently hides/disables the mutation boundary, and manufacturing a failing mutation would degrade the established invitation invariant. Do not use generic `returnToFeature` here.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
  yarn biome check --write packages/trpc/server/routers/viewer/organizations/organizations.handler.ts packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.tsx apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(organizations): connect Team-required invitation prompt"` after staging only these four files.

## Task 8: Preserve structured denials across calendar REST

**Scope:** 4 code files, expected under 280 changed lines.

**Files:**

- Modify: `apps/web/pages/api/integrations/[...args].ts`
- Create: `apps/web/pages/api/integrations/integrations.entitlements.test.ts`
- Modify: `packages/app-store/_utils/useAddAppMutation.ts`
- Create: `packages/app-store/_utils/useAddAppMutation.entitlements.test.tsx`

- [ ] Add API tests for `CalendarConnectionEntitlementService` limit failures. Require a stable non-2xx response body:

  ```ts
  type IntegrationErrorResponse = {
    message: string;
    entitlement?: EntitlementDenial;
  };
  ```

  Assert `entitlement` is included only when `getEntitlementDenialFromError` recognizes the error. Provider/OAuth exceptions, generic authorization errors, and entitlement-like messages return the current message only.

- [ ] Add hook tests proving the response’s allowlisted denial is parsed and delivered through an optional callback:

  ```ts
  type UseAddAppMutationOptions = {
    onEntitlementDenied?: (denial: EntitlementDenial) => void;
  };
  ```

  The callback fires for a valid `connectedCalendars` denial and not for malformed JSON, generic 403/500 responses, or provider errors. Existing success and toast behavior remains.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test apps/web/pages/api/integrations/integrations.entitlements.test.ts packages/app-store/_utils/useAddAppMutation.entitlements.test.tsx
  ```

- [ ] Implement allowlisted REST serialization and parsing. Do not make `packages/app-store` import a web billing provider; the callback is the package boundary.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test apps/web/pages/api/integrations/integrations.entitlements.test.ts packages/app-store/_utils/useAddAppMutation.entitlements.test.tsx
  yarn biome check --write 'apps/web/pages/api/integrations/[...args].ts' apps/web/pages/api/integrations/integrations.entitlements.test.ts packages/app-store/_utils/useAddAppMutation.ts packages/app-store/_utils/useAddAppMutation.entitlements.test.tsx
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(calendars): preserve connection entitlement errors"` after staging only these four files.

## Task 9: Bridge calendar install denials into the web prompt

**Scope:** 7 code files, expected under 420 changed lines.

**Files:**

- Create: `packages/app-store/_utils/EntitlementUpgradeBridge.tsx`
- Create: `packages/app-store/_utils/EntitlementUpgradeBridge.test.tsx`
- Create: `apps/web/modules/apps/CalendarEntitlementUpgradeBridge.tsx`
- Create: `apps/web/modules/apps/CalendarEntitlementUpgradeBridge.test.tsx`
- Modify: `apps/web/modules/shell/Shell.tsx`
- Modify: `apps/web/modules/shell/Shell.test.tsx`
- Modify: `packages/app-store/_utils/useAddAppMutation.ts`

- [ ] Add package tests for a context with this billing-agnostic contract:

  ```ts
  type EntitlementDeniedHandler = (denial: EntitlementDenial) => void;

  export function EntitlementUpgradeBridgeProvider(props: {
    onEntitlementDenied: EntitlementDeniedHandler;
    children: React.ReactNode;
  }): JSX.Element;

  export function useEntitlementDeniedHandler(): EntitlementDeniedHandler | undefined;
  ```

  Prove nested consumers receive the handler and a consumer outside the provider remains safe and undefined.

- [ ] Add web-adapter tests proving a `connectedCalendars` denial opens “Another calendar belongs in Pro/Team.” with exact approved body and current app page `returnTo`. Unknown denials do nothing.

- [ ] Add shell tests proving the adapter wraps normal shell children inside the existing `UpgradePromptProvider`; retain all existing shell provider/order assertions.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test packages/app-store/_utils/EntitlementUpgradeBridge.test.tsx apps/web/modules/apps/CalendarEntitlementUpgradeBridge.test.tsx apps/web/modules/shell/Shell.test.tsx
  ```

- [ ] Implement the small context, web adapter, and shell mount. Update `useAddAppMutation` to read the optional context handler and call it through Task 8’s callback path. If React hook rules make the package hook integration clearer by accepting the callback as an option from its existing callers, keep the same context contract at the nearest shared web caller; do not introduce a global event bus.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test packages/app-store/_utils/EntitlementUpgradeBridge.test.tsx apps/web/modules/apps/CalendarEntitlementUpgradeBridge.test.tsx apps/web/modules/shell/Shell.test.tsx packages/app-store/_utils/useAddAppMutation.entitlements.test.tsx
  yarn biome check --write packages/app-store/_utils/EntitlementUpgradeBridge.tsx packages/app-store/_utils/EntitlementUpgradeBridge.test.tsx apps/web/modules/apps/CalendarEntitlementUpgradeBridge.tsx apps/web/modules/apps/CalendarEntitlementUpgradeBridge.test.tsx apps/web/modules/shell/Shell.tsx apps/web/modules/shell/Shell.test.tsx packages/app-store/_utils/useAddAppMutation.ts
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(calendars): bridge install limits to upgrade prompt"` after staging only the seven files listed above.

## Task 10: Cover the six direct calendar credential forms

**Scope:** 8 code files, expected under 420 changed lines.

**Files:**

- Create: `apps/web/components/apps/useCalendarIntegrationFetch.ts`
- Create: `apps/web/components/apps/useCalendarIntegrationFetch.test.tsx`
- Modify: `apps/web/components/apps/applecalendar/Setup.tsx`
- Modify: `apps/web/components/apps/caldavcalendar/Setup.tsx`
- Modify: `apps/web/components/apps/exchange2013calendar/Setup.tsx`
- Modify: `apps/web/components/apps/exchange2016calendar/Setup.tsx`
- Modify: `apps/web/components/apps/exchangecalendar/Setup.tsx`
- Modify: `apps/web/components/apps/ics-feedcalendar/Setup.tsx`

- [ ] Write wrapper tests for this interface:

  ```ts
  export function useCalendarIntegrationFetch(): (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
  ```

  For a valid REST `connectedCalendars` denial, it must call the bridge handler once and still return the original `Response` so each form’s current error behavior runs. It must not consume the body irreversibly: parse `response.clone()`. Generic 403/500, invalid JSON, provider errors, and entitlement-like messages do not call the handler.

- [ ] Add one parameterized integration test in the same test file that renders each of the six Setup components, submits its minimal valid form, returns a structured denial, and asserts the handler fires without persisting credentials. Mock provider-specific validation only at its network boundary.

- [ ] Run RED:

  ```bash
  TZ=UTC yarn test apps/web/components/apps/useCalendarIntegrationFetch.test.tsx
  ```

- [ ] Replace only the integration submission `fetch` in each Setup component with the wrapper. Do not alter payload shape, credential validation, success redirects, or ordinary error toasts.

- [ ] Run GREEN and gates:

  ```bash
  TZ=UTC yarn test apps/web/components/apps/useCalendarIntegrationFetch.test.tsx
  yarn biome check --write apps/web/components/apps/useCalendarIntegrationFetch.ts apps/web/components/apps/useCalendarIntegrationFetch.test.tsx apps/web/components/apps/applecalendar/Setup.tsx apps/web/components/apps/caldavcalendar/Setup.tsx apps/web/components/apps/exchange2013calendar/Setup.tsx apps/web/components/apps/exchange2016calendar/Setup.tsx apps/web/components/apps/exchangecalendar/Setup.tsx apps/web/components/apps/ics-feedcalendar/Setup.tsx
  yarn type-check:ci --force
  git diff --check
  git diff --stat HEAD
  ```

- [ ] Commit with `git commit -m "feat(calendars): prompt from direct connection forms"` after staging only these eight files.

## Final verification and review handoff

- [ ] Run the complete focused suite from the repository root:

  ```bash
  TZ=UTC yarn test packages/features/billing/lib/entitlementDenial.test.ts packages/trpc/server/errorFormatter.test.ts apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/useEntitlementUpgrade.test.tsx apps/web/modules/event-types/hooks/useCreateEventType.test.tsx apps/web/modules/event-types/views/event-types-listing-view.test.tsx apps/web/modules/event-types/components/EventTypeWebWrapper.entitlements.test.tsx apps/web/modules/api-keys/api-keys/components/ApiKeyDialogForm.test.tsx apps/web/modules/event-types/components/tabs/webhooks/EventWebhooksTab.entitlements.test.tsx apps/web/modules/webhooks/views/webhook-new-view.entitlements.test.tsx apps/web/modules/settings/my-account/appearance-view.entitlements.test.tsx packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.test.tsx apps/web/pages/api/integrations/integrations.entitlements.test.ts packages/app-store/_utils/useAddAppMutation.entitlements.test.tsx packages/app-store/_utils/EntitlementUpgradeBridge.test.tsx apps/web/modules/apps/CalendarEntitlementUpgradeBridge.test.tsx apps/web/modules/shell/Shell.test.tsx apps/web/components/apps/useCalendarIntegrationFetch.test.tsx
  ```

- [ ] Run repository gates:

  ```bash
  yarn biome check --write packages/features/billing/lib/entitlementDenial.ts packages/features/billing/lib/entitlementDenial.test.ts packages/trpc/server/errorFormatter.ts packages/trpc/server/errorFormatter.test.ts apps/web/modules/billing apps/web/modules/event-types apps/web/modules/api-keys/api-keys/components apps/web/modules/webhooks/views apps/web/modules/settings/my-account apps/web/modules/organizations packages/trpc/server/routers/viewer/organizations packages/app-store/_utils apps/web/modules/apps apps/web/modules/shell apps/web/components/apps
  yarn type-check:ci --force
  git diff --check 3f462343a5..HEAD
  git status --short
  ```

- [ ] Confirm the cumulative diff contains no message-based checkout trigger:

  ```bash
  git diff 3f462343a5..HEAD | rg -n 'FORBIDDEN|message.*(plan|upgrade|entitle)|includes\(|match\('
  ```

  Review every hit. The only acceptable `FORBIDDEN` occurrences are negative tests or unchanged ordinary error handling. No `message`, `includes`, or regex branch may open the upgrade prompt.

- [ ] Confirm the invitation intent invariants still pass explicitly:

  ```bash
  TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
  ```

- [ ] Review each commit with `git show --stat --oneline HEAD~10..HEAD` and verify every implementation commit stays below 500 changed code lines and at most 10 code files.

- [ ] Use `superpowers:requesting-code-review` for the completed branch. Report the approved design link, baseline, focused test results, Biome result, full type-check result, and any intentional invitation read-model exception in the review request.
