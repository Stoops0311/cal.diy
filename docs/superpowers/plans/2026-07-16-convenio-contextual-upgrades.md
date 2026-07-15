# Convenio Contextual Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the booking-history pricing redirect with a safe in-context Team prompt that survives Polar checkout, reconciles the correct billing subject, and restores the original route.

**Architecture:** A versioned session-storage module validates the only data allowed to cross the hosted-checkout boundary, while one shared client hook remains the controller for all paid-plan checkout entry points. An authenticated-shell provider renders the approved Convenio prompt through `PlanSelector`; billing settings consumes the intent only after reconciliation proves the required plan is active, and the server-rendered booking-history route keeps its entitlement early return while rendering a client prompt trigger instead of protected history.

**Tech Stack:** Next.js App Router, React, TypeScript, tRPC, Polar-backed billing mutations, next-i18next, Radix Sheet through `@calcom/ui`, Vitest, Testing Library.

## Global Constraints

- Preserve Polar hosted checkout, webhook processing, product configuration, subscription projection, and `EntitlementService` decisions.
- The server booking-history entitlement check remains the enforcement boundary; a gated branch must never render `BookingHistoryPage` or issue its tRPC query.
- Store only version `1`, a same-origin relative return path, an allowlisted resume discriminant, a required plan, a creation timestamp, and an allowlisted billing subject.
- Upgrade intent expires after exactly 30 minutes, remains after cancellation, and is cleared only after successful restoration or validation failure.
- Team checkout must persist `{ kind: "organization", organizationId }` before leaving for Polar. The success callback drops `organizationId`, so billing settings must recover this subject from the validated intent before reconciliation.
- A previous paid projection is not proof that the new checkout completed. Restore only after the reconcile mutation succeeds, the refreshed projection is active, and its plan satisfies the stored requirement.
- Reuse `viewer.billing.createCheckout` through one client controller; presentation components must not import Polar services or reproduce provider state.
- Use the approved copy exactly: `TEAM`, `Booking history belongs in Team.`, `Keep the decisions behind every booking visible to the people responsible for it.`, `Choose Team ›`, and `Not now`.
- Use theme tokens and direct shared-component imports. Add all new UI strings to `packages/i18n/locales/en/common.json`.
- Each task is a separate stacked PR with fewer than 500 changed lines and no more than 10 code files.
- Use TDD, run Biome on changed files, and run `yarn type-check:ci --force` before the task review gate.

---

### Task 1: Safe upgrade intent and shared paid-checkout controller

**Files:**
- Create: `apps/web/modules/billing/upgradeIntent.ts`
- Test: `apps/web/modules/billing/upgradeIntent.test.ts`
- Create: `apps/web/modules/billing/usePaidPlanCheckout.ts`
- Test: `apps/web/modules/billing/usePaidPlanCheckout.test.tsx`
- Modify: `apps/web/modules/billing/Pricing.tsx`
- Test: `apps/web/modules/billing/Pricing.test.tsx`
- Modify: `apps/web/modules/organizations/CreateOrganization.tsx`
- Test: `apps/web/modules/organizations/CreateOrganization.test.tsx`

**Interfaces:**
- Consumes: `PaidSelection` and `PaidPlanKey`; `trpc.viewer.billing.createCheckout.useMutation`; `showToast`; Next.js `useRouter`; the repository-safe `@calcom/lib/webstorage` session-storage wrapper.
- Produces:

```ts
export type UpgradeCapability = "bookingAudit";
export type UpgradeResume = { kind: "openBookingAudit"; bookingUid: string };
export type UpgradeBillingSubject =
  | { kind: "user" }
  | { kind: "organization"; organizationId: number };
export type UpgradeIntentRequest = {
  capability: UpgradeCapability;
  requiredPlan: "PRO" | "TEAM";
  returnTo: string;
  resume: UpgradeResume;
};
export type UpgradeIntentV1 = UpgradeIntentRequest & {
  version: 1;
  createdAt: number;
  subject?: UpgradeBillingSubject;
};

export function normalizeRelativePath(value: string): string | null;
export function saveUpgradeIntent(
  request: UpgradeIntentRequest,
  options?: { now?: number; subject?: UpgradeBillingSubject }
): boolean;
export function readUpgradeIntent(now?: number): UpgradeIntentV1 | null;
export function consumeUpgradeIntent(now?: number): UpgradeIntentV1 | null;
export function bindUpgradeIntentToOrganization(organizationId: number): void;
export function addUpgradeSuccessMarker(returnTo: string): string;

export type CheckoutContext = { selection: PaidSelection; organizationId?: number };
export function usePaidPlanCheckout(options?: {
  organizationId?: number;
  returnTo?: string;
  onBeforeNavigate?(context: CheckoutContext): void;
}): {
  pendingPlan?: PaidPlanKey;
  startCheckout(selection: PaidSelection, organizationIdOverride?: number): void;
};
```

- [ ] **Step 1: Write the failing upgrade-intent tests**

Create `apps/web/modules/billing/upgradeIntent.test.ts` with concrete coverage for canonical paths, strict shape validation, expiry, consumption, organization binding, and the success marker:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  addUpgradeSuccessMarker,
  bindUpgradeIntentToOrganization,
  consumeUpgradeIntent,
  normalizeRelativePath,
  readUpgradeIntent,
  saveUpgradeIntent,
} from "./upgradeIntent";

const request = {
  capability: "bookingAudit" as const,
  requiredPlan: "TEAM" as const,
  returnTo: "/booking/book_123/logs?from=bookings#history",
  resume: { kind: "openBookingAudit" as const, bookingUid: "book_123" },
};

describe("upgrade intent", () => {
  beforeEach(() => sessionStorage.clear());

  it.each(["https://evil.test/x", "//evil.test/x", "/\\\\evil.test/x", "", "pricing"])(
    "rejects unsafe return path %s",
    (value) => expect(normalizeRelativePath(value)).toBeNull()
  );

  it("retains a valid intent until it is consumed", () => {
    expect(saveUpgradeIntent(request, { now: 1_000 })).toBe(true);
    expect(readUpgradeIntent(1_000)).toMatchObject({ ...request, createdAt: 1_000, version: 1 });
    expect(readUpgradeIntent(1_000)).not.toBeNull();
    expect(consumeUpgradeIntent(1_000)).toMatchObject(request);
    expect(readUpgradeIntent(1_000)).toBeNull();
  });

  it("expires and removes the intent at thirty minutes", () => {
    saveUpgradeIntent(request, { now: 1_000 });
    expect(readUpgradeIntent(1_000 + 30 * 60 * 1_000 - 1)).not.toBeNull();
    expect(readUpgradeIntent(1_000 + 30 * 60 * 1_000)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("rejects malformed and non-allowlisted stored shapes", () => {
    sessionStorage.setItem("convenio:upgrade-intent:v1", "{");
    expect(readUpgradeIntent()).toBeNull();
    sessionStorage.setItem(
      "convenio:upgrade-intent:v1",
      JSON.stringify({ ...request, version: 1, createdAt: Date.now(), extra: "no" })
    );
    expect(readUpgradeIntent()).toBeNull();
  });

  it("binds a newly created organization before Team checkout", () => {
    saveUpgradeIntent(request, { now: 1_000 });
    bindUpgradeIntentToOrganization(41);
    expect(readUpgradeIntent(1_000)?.subject).toEqual({ kind: "organization", organizationId: 41 });
  });

  it("adds a small success marker without losing query or hash", () => {
    expect(addUpgradeSuccessMarker("/booking/book_123/logs?from=bookings#history")).toBe(
      "/booking/book_123/logs?from=bookings&upgrade=complete#history"
    );
  });
});
```

- [ ] **Step 2: Run the intent test and verify the missing-module failure**

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts
```

Expected: FAIL because `./upgradeIntent` does not exist.

- [ ] **Step 3: Implement strict versioned storage**

Create `apps/web/modules/billing/upgradeIntent.ts` with the interfaces above and these validation rules:

```ts
import { sessionStorage } from "@calcom/lib/webstorage";

const STORAGE_KEY = "convenio:upgrade-intent:v1";
const MAX_AGE_MS = 30 * 60 * 1_000;
const BASE_ORIGIN = "https://convenio.local";

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeRelativePath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, BASE_ORIGIN);
    if (url.origin !== BASE_ORIGIN) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function parseResume(value: unknown): UpgradeResume | null {
  if (!isRecord(value) || !hasExactKeys(value, ["kind", "bookingUid"])) return null;
  if (value.kind !== "openBookingAudit") return null;
  if (typeof value.bookingUid !== "string" || value.bookingUid.length < 1 || value.bookingUid.length > 128) {
    return null;
  }
  return { kind: "openBookingAudit", bookingUid: value.bookingUid };
}

function parseSubject(value: unknown): UpgradeBillingSubject | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "user" && hasExactKeys(value, ["kind"])) return { kind: "user" };
  if (
    value.kind === "organization" &&
    hasExactKeys(value, ["kind", "organizationId"]) &&
    Number.isInteger(value.organizationId) &&
    Number(value.organizationId) > 0
  ) {
    return { kind: "organization", organizationId: Number(value.organizationId) };
  }
  return null;
}

function parseIntent(value: unknown, now: number): UpgradeIntentV1 | null {
  if (!isRecord(value)) return null;
  const expectedKeys = value.subject === undefined
    ? ["capability", "createdAt", "requiredPlan", "resume", "returnTo", "version"]
    : ["capability", "createdAt", "requiredPlan", "resume", "returnTo", "subject", "version"];
  if (!hasExactKeys(value, expectedKeys)) return null;
  const returnTo = typeof value.returnTo === "string" ? normalizeRelativePath(value.returnTo) : null;
  const resume = parseResume(value.resume);
  const subject = parseSubject(value.subject);
  if (
    value.version !== 1 || value.capability !== "bookingAudit" ||
    (value.requiredPlan !== "PRO" && value.requiredPlan !== "TEAM") ||
    typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) ||
    now - value.createdAt < 0 || now - value.createdAt >= MAX_AGE_MS ||
    !returnTo || !resume || subject === null
  ) return null;
  return {
    version: 1,
    capability: "bookingAudit",
    requiredPlan: value.requiredPlan,
    returnTo,
    resume,
    createdAt: value.createdAt,
    ...(subject ? { subject } : {}),
  };
}

export function saveUpgradeIntent(
  request: UpgradeIntentRequest,
  options: { now?: number; subject?: UpgradeBillingSubject } = {}
): boolean {
  const returnTo = normalizeRelativePath(request.returnTo);
  const resume = parseResume(request.resume);
  if (!returnTo || !resume || request.capability !== "bookingAudit") return false;
  const intent: UpgradeIntentV1 = {
    ...request,
    returnTo,
    resume,
    version: 1,
    createdAt: options.now ?? Date.now(),
    ...(options.subject ? { subject: options.subject } : {}),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  return true;
}

export function readUpgradeIntent(now = Date.now()): UpgradeIntentV1 | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const intent = parseIntent(JSON.parse(raw), now);
    if (intent) return intent;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  sessionStorage.removeItem(STORAGE_KEY);
  return null;
}

export function consumeUpgradeIntent(now = Date.now()): UpgradeIntentV1 | null {
  const intent = readUpgradeIntent(now);
  if (intent) sessionStorage.removeItem(STORAGE_KEY);
  return intent;
}

export function bindUpgradeIntentToOrganization(organizationId: number): void {
  const intent = readUpgradeIntent();
  if (!intent || intent.requiredPlan !== "TEAM" || !Number.isInteger(organizationId) || organizationId < 1) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...intent, subject: { kind: "organization", organizationId } }));
}

export function addUpgradeSuccessMarker(returnTo: string): string {
  const safePath = normalizeRelativePath(returnTo) ?? "/settings/billing";
  const url = new URL(safePath, BASE_ORIGIN);
  url.searchParams.set("upgrade", "complete");
  return `${url.pathname}${url.search}${url.hash}`;
}
```

Define the exported types exactly as listed in **Interfaces** above the constants.

- [ ] **Step 4: Run the intent test and verify it passes**

Run `TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts`.

Expected: PASS with six tests.

- [ ] **Step 5: Write the failing shared-controller test**

Create `apps/web/modules/billing/usePaidPlanCheckout.test.tsx` using `renderHook`, mocked `createCheckout`, router, locale, and toast. Assert these exact behaviors:

```ts
it("uses the existing mutation for Pro", () => {
  const { result } = renderHook(() => usePaidPlanCheckout());
  act(() => result.current.startCheckout({ interval: "YEAR", plan: "PRO" }));
  expect(mocks.mutate).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });
});

it("routes Team without an organization through bootstrap", () => {
  const { result } = renderHook(() => usePaidPlanCheckout({ returnTo: "/booking/book_123/logs" }));
  act(() => result.current.startCheckout({ interval: "MONTH", plan: "TEAM" }));
  expect(mocks.push).toHaveBeenCalledWith(
    "/settings/organizations/new?returnTo=%2Fbooking%2Fbook_123%2Flogs&interval=MONTH"
  );
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it("submits Team with the resolved organization subject", () => {
  const before = vi.fn();
  const { result } = renderHook(() => usePaidPlanCheckout({ organizationId: 41, onBeforeNavigate: before }));
  act(() => result.current.startCheckout({ interval: "YEAR", plan: "TEAM" }));
  expect(before).toHaveBeenCalledWith({
    selection: { interval: "YEAR", plan: "TEAM" },
    organizationId: 41,
  });
  expect(mocks.mutate).toHaveBeenCalledWith({ interval: "YEAR", organizationId: 41, plan: "TEAM" });
});
```

- [ ] **Step 6: Run the controller test and verify the missing-hook failure**

Run `TZ=UTC yarn test apps/web/modules/billing/usePaidPlanCheckout.test.tsx`.

Expected: FAIL because `./usePaidPlanCheckout` does not exist.

- [ ] **Step 7: Implement the shared controller and migrate both existing callers**

Create `usePaidPlanCheckout.ts` with one `createCheckout` mutation. Call `onBeforeNavigate` before both a mutation and organization-bootstrap navigation. For Team, resolve `organizationIdOverride ?? options.organizationId`; for Pro, never attach an organization. Use `normalizeRelativePath(options.returnTo ?? "/pricing") ?? "/pricing"`, the existing `billing_checkout_error` toast, and `window.location.assign(checkoutUrl)`.

In `Pricing.tsx`, keep anonymous signup handling local, but replace authenticated mutation and Team branching with:

```ts
const paidCheckout = usePaidPlanCheckout({ organizationId, returnTo: "/pricing" });

const selectPlan = (selection: PaidSelection) => {
  if (!isAuthenticated) {
    localStorage.setItem("onBoardingRedirect", "/pricing");
    router.push("/signup");
    return;
  }
  paidCheckout.startCheckout(selection);
};
```

Pass `paidCheckout.pendingPlan` to `Pricing`.

In `CreateOrganization.tsx`, remove its direct billing mutation and use:

```ts
const paidCheckout = usePaidPlanCheckout({
  returnTo,
  onBeforeNavigate: ({ organizationId }) => {
    if (organizationId) bindUpgradeIntentToOrganization(organizationId);
  },
});

onSuccess: ({ organizationId }) => {
  if (checkoutInterval) {
    paidCheckout.startCheckout({ interval: checkoutInterval, plan: "TEAM" }, organizationId);
    return;
  }
  router.push(withOrganizationId(returnTo, organizationId));
},
```

Set form pending to `create.isPending || paidCheckout.pendingPlan !== undefined`. Implement `safeReturnTo` as `normalizeRelativePath(value ?? "") ?? "/settings/billing"`.

- [ ] **Step 8: Update caller tests and run the focused suite**

Update `Pricing.test.tsx` to mock `usePaidPlanCheckout`, assert authenticated selections call `startCheckout`, and retain the anonymous signup assertion. Update `CreateOrganization.test.tsx` to assert `/\\evil.test/x` is rejected and that a successful checkout creation binds organization `41` before `startCheckout` receives the Team selection and override.

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/usePaidPlanCheckout.test.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/organizations/CreateOrganization.test.tsx
```

Expected: PASS for all four files; no caller invokes `viewer.billing.createCheckout` directly outside `usePaidPlanCheckout.ts`.

- [ ] **Step 9: Format, type-check, and commit Task 1**

```bash
yarn biome check --write apps/web/modules/billing/upgradeIntent.ts apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/usePaidPlanCheckout.ts apps/web/modules/billing/usePaidPlanCheckout.test.tsx apps/web/modules/billing/Pricing.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/organizations/CreateOrganization.tsx apps/web/modules/organizations/CreateOrganization.test.tsx
yarn type-check:ci --force
git add apps/web/modules/billing/upgradeIntent.ts apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/usePaidPlanCheckout.ts apps/web/modules/billing/usePaidPlanCheckout.test.tsx apps/web/modules/billing/Pricing.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/organizations/CreateOrganization.tsx apps/web/modules/organizations/CreateOrganization.test.tsx
git commit -m "feat(billing): preserve contextual checkout intent"
```

Expected: Biome clean, all type-check tasks pass, and the Task 1 PR changes eight code files and fewer than 500 lines.

---

### Task 2: Authenticated Convenio upgrade prompt

**Files:**
- Create: `apps/web/modules/billing/UpgradePromptProvider.tsx`
- Test: `apps/web/modules/billing/UpgradePromptProvider.test.tsx`
- Modify: `apps/web/modules/billing/PlanSelector.tsx`
- Test: `apps/web/modules/billing/PlanSelector.test.tsx`
- Modify: `apps/web/modules/shell/Shell.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: Task 1 `saveUpgradeIntent`, `UpgradeCapability`, `UpgradeResume`, and `usePaidPlanCheckout`; `useCurrentSession`; shared `PlanSelector`, `Sheet`, and `Button`.
- Produces:

```ts
export type OpenUpgradePromptInput = {
  capability: UpgradeCapability;
  featureName: string;
  requiredPlan: "PRO" | "TEAM";
  returnTo: string;
  resume: UpgradeResume;
};
export function useUpgradePrompt(): {
  openUpgradePrompt(input: OpenUpgradePromptInput): void;
};
export function UpgradePromptProvider(props: { children: React.ReactNode }): React.ReactElement;
```

- Extends `PlanSelectorProps` without changing default `/pricing` behavior:

```ts
visiblePlans?: readonly PaidPlanKey[];
showAllPlans?: boolean;
ctaKeys?: Partial<Record<PaidPlanKey, string>>;
```

- [ ] **Step 1: Write failing selector-variant and provider tests**

Add to `PlanSelector.test.tsx`:

```ts
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
});
```

Create `UpgradePromptProvider.test.tsx` with a child harness that calls `useUpgradePrompt`. Mock locale, session, `PlanSelector`, and `usePaidPlanCheckout`; assert:

```ts
fireEvent.click(view.getByRole("button", { name: "open" }));
expect(view.getByText("Booking history belongs in Team.")).toBeInTheDocument();
expect(view.getByText("Keep the decisions behind every booking visible to the people responsible for it.")).toBeInTheDocument();
expect(view.getByTestId("plan-selector")).toHaveAttribute("data-visible-plans", "TEAM");
fireEvent.click(view.getByRole("button", { name: "Not now" }));
expect(view.queryByText("Booking history belongs in Team.")).not.toBeInTheDocument();
```

In a second test, invoke the mocked selector with `{ interval: "YEAR", plan: "TEAM" }`, then assert `saveUpgradeIntent` runs with the request and organization subject before `startCheckout`.

- [ ] **Step 2: Run tests and verify the new API/provider failures**

```bash
TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/billing/UpgradePromptProvider.test.tsx
```

Expected: FAIL because `PlanSelector` lacks variant props and `UpgradePromptProvider` does not exist.

- [ ] **Step 3: Add the selector variant without changing defaults**

Change the `PlanSelector` signature to:

```ts
export function PlanSelector({
  freeHref,
  onSelectPlan,
  pendingPlan,
  visiblePlans = ["PRO", "TEAM"],
  showAllPlans = true,
}: PlanSelectorProps): React.ReactElement {
```

Filter `paidPlans` with `visiblePlans.includes(plan.plan)`, use `md:grid-cols-2` only when more than one plan is visible, and wrap the existing proof plus Free-plan `Sheet` in `showAllPlans ? (...) : null`. Render each button label with `t(ctaKeys?.[plan.plan] ?? plan.cta)`. Keep yearly-first state, prices, copy, and default CTA behavior unchanged.

- [ ] **Step 4: Implement the provider with exact prompt copy**

Create `UpgradePromptProvider.tsx`. Its context default throws `new Error("useUpgradePrompt must be used within UpgradePromptProvider")`. The provider holds `OpenUpgradePromptInput | null`, derives a manageable organization only when `session.user.org?.role` is `OWNER` or `ADMIN`, and configures the controller as follows:

```ts
const paidCheckout = usePaidPlanCheckout({
  organizationId,
  returnTo: prompt?.returnTo ?? "/pricing",
  onBeforeNavigate: ({ organizationId, selection }) => {
    if (!prompt) return;
    saveUpgradeIntent({
      capability: prompt.capability,
      requiredPlan: prompt.requiredPlan,
      returnTo: prompt.returnTo,
      resume: prompt.resume,
    }, {
      subject: organizationId
        ? { kind: "organization", organizationId }
        : selection.plan === "PRO"
          ? { kind: "user" }
          : undefined,
    });
  },
});
```

Render a controlled `Sheet`. Its content must use:

```tsx
<SheetHeader>
  <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">
    {prompt?.requiredPlan === "TEAM" ? t("billing_plan_team") : t("billing_plan_pro")}
  </p>
  <SheetTitle>{prompt?.capability === "bookingAudit" ? t("billing_upgrade_booking_audit_title") : ""}</SheetTitle>
  <SheetDescription>
    {prompt?.capability === "bookingAudit" ? t("billing_upgrade_booking_audit_description") : ""}
  </SheetDescription>
</SheetHeader>
<SheetBody>
  {prompt ? (
    <PlanSelector
      freeHref={prompt.returnTo}
      onSelectPlan={paidCheckout.startCheckout}
      pendingPlan={paidCheckout.pendingPlan}
      showAllPlans={false}
      visiblePlans={[prompt.requiredPlan]}
      ctaKeys={{
        [prompt.requiredPlan]:
          prompt.requiredPlan === "TEAM" ? "billing_upgrade_choose_team" : "billing_upgrade_choose_pro",
      }}
    />
  ) : null}
  <Button color="minimal" className="mt-4 w-full justify-center" onClick={() => setPrompt(null)}>
    {t("billing_upgrade_not_now")}
  </Button>
</SheetBody>
```

`onOpenChange(false)` clears prompt so Escape and overlay dismissal restore focus through Radix.

- [ ] **Step 5: Mount the provider once per authenticated shell and add translations**

In `Shell.tsx`, wrap only the non-public return branch:

```tsx
return !props.isPublic ? (
  <UpgradePromptProvider>
    <KBarWrapper withKBar>
      <Layout {...props} />
    </KBarWrapper>
  </UpgradePromptProvider>
) : (
  <PublicShell {...props} />
);
```

Add these entries to `packages/i18n/locales/en/common.json`:

```json
"billing_upgrade_booking_audit_title": "Booking history belongs in Team.",
"billing_upgrade_booking_audit_description": "Keep the decisions behind every booking visible to the people responsible for it.",
"billing_upgrade_choose_pro": "Choose Pro",
"billing_upgrade_choose_team": "Choose Team",
"billing_upgrade_not_now": "Not now"
```

The contextual CTA keys plus the selector’s existing arrow render `Choose Pro ›` or `Choose Team ›` without changing the public Team CTA, `Bring in the team ›`.

- [ ] **Step 6: Run tests, format, type-check, and commit Task 2**

```bash
TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/Pricing.test.tsx
yarn biome check --write apps/web/modules/billing/UpgradePromptProvider.tsx apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/PlanSelector.tsx apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/shell/Shell.tsx packages/i18n/locales/en/common.json
yarn type-check:ci --force
git add apps/web/modules/billing/UpgradePromptProvider.tsx apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/PlanSelector.tsx apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/shell/Shell.tsx packages/i18n/locales/en/common.json
git commit -m "feat(billing): add contextual upgrade prompt"
```

Expected: focused tests pass, type-check passes, and the Task 2 PR changes six code files and fewer than 500 lines.

---

### Task 3: Verified checkout restoration and booking-history gate

**Files:**
- Modify: `apps/web/modules/billing/BillingSettings.tsx`
- Test: `apps/web/modules/billing/BillingSettings.test.tsx`
- Create: `apps/web/modules/billing/BookingHistoryUpgradePrompt.tsx`
- Test: `apps/web/modules/billing/BookingHistoryUpgradePrompt.test.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/(main-nav)/booking/[uid]/logs/page.tsx`

**Interfaces:**
- Consumes: Task 1 `readUpgradeIntent`, `consumeUpgradeIntent`, `addUpgradeSuccessMarker`, and `UpgradeIntentV1`; Task 2 `useUpgradePrompt`; current billing projection and reconcile mutation.
- Produces:

```ts
export function BookingHistoryUpgradePrompt(props: { bookingUid: string }): React.ReactElement;
```

- Restores only when:

```ts
function projectionSatisfiesIntent(
  projection: BillingProjection,
  intent: UpgradeIntentV1
): boolean;
```

- [ ] **Step 1: Write failing restoration and prompt-trigger tests**

Extend `BillingSettings.test.tsx` with a container test that mocks `readUpgradeIntent` as a Team intent with organization `41`, mocks the billing query/mutation, and asserts:

```ts
expect(mocks.reconcileMutate).not.toHaveBeenCalled();
await waitFor(() => expect(mocks.reconcileMutate).toHaveBeenCalledWith({ organizationId: 41 }));
expect(mocks.consumeUpgradeIntent).not.toHaveBeenCalled();

mocks.reconcileIsSuccess = true;
mocks.projection = { ...teamProjection, plan: "TEAM", status: "ACTIVE" };
rerender(<BillingSettings checkoutId="checkout_123" initialProjection={freeProjection} />);
await waitFor(() => {
  expect(mocks.consumeUpgradeIntent).toHaveBeenCalled();
  expect(mocks.replace).toHaveBeenCalledWith("/booking/book_123/logs?upgrade=complete");
});
```

Add a second case with an already-active initial Pro projection and `reconcileIsSuccess = false`; assert neither consumption nor navigation occurs.

Create `BookingHistoryUpgradePrompt.test.tsx`, mock `useUpgradePrompt`, and assert the exact request:

```ts
expect(mocks.openUpgradePrompt).toHaveBeenCalledWith({
  capability: "bookingAudit",
  featureName: "Booking history",
  requiredPlan: "TEAM",
  returnTo: "/booking/book_123/logs",
  resume: { kind: "openBookingAudit", bookingUid: "book_123" },
});
```

Click its visible `Choose Team ›` reopen button after the mount effect and assert the same request is sent again.

- [ ] **Step 2: Run tests and verify missing restoration/trigger behavior**

```bash
TZ=UTC yarn test apps/web/modules/billing/BillingSettings.test.tsx apps/web/modules/billing/BookingHistoryUpgradePrompt.test.tsx
```

Expected: FAIL because the trigger does not exist and `BillingSettings` does not read or restore upgrade intent.

- [ ] **Step 3: Implement subject-aware reconciliation and verified restoration**

In `BillingSettings.tsx`, import `useRouter`, `useState`, and the Task 1 intent functions. Add:

```ts
function projectionSatisfiesIntent(projection: BillingProjection, intent: UpgradeIntentV1): boolean {
  if (!activeStatuses.has(projection.status)) return false;
  if (intent.requiredPlan === "TEAM") return projection.plan === "TEAM";
  return projection.plan === "PRO" || projection.plan === "TEAM";
}
```

Inside `BillingSettings`, load intent after mount and block reconciliation until that read completes:

```ts
const router = useRouter();
const [restoreIntent, setRestoreIntent] = useState<UpgradeIntentV1 | null>(null);
const [intentResolved, setIntentResolved] = useState(!checkoutId);

useEffect(() => {
  if (!checkoutId) return;
  setRestoreIntent(readUpgradeIntent());
  setIntentResolved(true);
}, [checkoutId]);

const intentOrganizationId =
  restoreIntent?.subject?.kind === "organization" ? restoreIntent.subject.organizationId : undefined;
const effectiveOrganizationId = organizationId ?? intentOrganizationId;
const subject = useMemo(
  () => (effectiveOrganizationId === undefined ? {} : { organizationId: effectiveOrganizationId }),
  [effectiveOrganizationId]
);
const initialSubjectMatches =
  initialProjection.subject.type === "ORGANIZATION"
    ? initialProjection.subject.id === effectiveOrganizationId
    : effectiveOrganizationId === undefined;
```

Pass `initialData: initialSubjectMatches ? initialProjection : undefined` and `enabled: intentResolved` to `billing.get.useQuery`. Amend the reconcile effect guard to `if (!checkoutId || !intentResolved || reconciledCheckout.current === checkoutId) return;`.

After the reconcile effect, add:

```ts
const restoredCheckout = useRef<string | undefined>(undefined);
useEffect(() => {
  if (
    !checkoutId || !restoreIntent || !reconcile.isSuccess || !query.data ||
    restoredCheckout.current === checkoutId || !projectionSatisfiesIntent(query.data, restoreIntent)
  ) return;
  const consumed = consumeUpgradeIntent();
  if (!consumed) return;
  restoredCheckout.current = checkoutId;
  router.replace(addUpgradeSuccessMarker(consumed.returnTo));
}, [checkoutId, query.data, reconcile.isSuccess, restoreIntent, router]);
```

Keep the existing pending and active alerts. A missing, malformed, expired, canceled, or mismatched intent stays on billing settings.

- [ ] **Step 4: Implement the in-context booking-history trigger**

Create `BookingHistoryUpgradePrompt.tsx`:

```tsx
"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { useCallback, useEffect, useRef } from "react";
import { useUpgradePrompt } from "./UpgradePromptProvider";

export function BookingHistoryUpgradePrompt({ bookingUid }: { bookingUid: string }): React.ReactElement {
  const { t } = useLocale();
  const { openUpgradePrompt } = useUpgradePrompt();
  const opened = useRef(false);
  const open = useCallback(() => {
    openUpgradePrompt({
      capability: "bookingAudit",
      featureName: t("booking_history"),
      requiredPlan: "TEAM",
      returnTo: `/booking/${encodeURIComponent(bookingUid)}/logs`,
      resume: { kind: "openBookingAudit", bookingUid },
    });
  }, [bookingUid, openUpgradePrompt, t]);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    open();
  }, [open]);

  return (
    <section className="border-subtle bg-default rounded-xl border p-6 text-center">
      <h2 className="font-cal text-emphasis text-xl font-semibold">
        {t("billing_upgrade_booking_audit_title")}
      </h2>
      <p className="text-subtle mx-auto mt-2 max-w-lg text-sm leading-6">
        {t("billing_upgrade_booking_audit_description")}
      </p>
      <Button className="mt-5" onClick={open}>
        <span>{t("billing_choose_team")}</span><span aria-hidden="true">›</span>
      </Button>
    </section>
  );
}
```

- [ ] **Step 5: Replace only the server redirect branch**

In `booking/[uid]/logs/page.tsx`, import `BookingHistoryUpgradePrompt` and replace the pricing redirect with:

```tsx
if (!entitlements.canReadBookingAudit) {
  return (
    <ShellMainAppDir heading={t("booking_history")} subtitle={t("booking_history_description")}>
      <BookingHistoryUpgradePrompt bookingUid={bookingUid} />
    </ShellMainAppDir>
  );
}
```

Leave the entitled return unchanged. The non-entitled branch must contain no `BookingHistoryPage`, booking-history service call, or client query.

- [ ] **Step 6: Run focused and regression tests**

```bash
TZ=UTC yarn test apps/web/modules/billing/BillingSettings.test.tsx apps/web/modules/billing/BookingHistoryUpgradePrompt.test.tsx apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/Pricing.test.tsx
```

Expected: PASS. Specifically, Team reconciliation uses `{ organizationId: 41 }`, old paid initial data does not restore early, and the gated trigger sends the exact booking UID and original relative route.

- [ ] **Step 7: Format, type-check, and commit Task 3**

```bash
yarn biome check --write apps/web/modules/billing/BillingSettings.tsx apps/web/modules/billing/BillingSettings.test.tsx apps/web/modules/billing/BookingHistoryUpgradePrompt.tsx apps/web/modules/billing/BookingHistoryUpgradePrompt.test.tsx 'apps/web/app/(use-page-wrapper)/(main-nav)/booking/[uid]/logs/page.tsx'
yarn type-check:ci --force
git add apps/web/modules/billing/BillingSettings.tsx apps/web/modules/billing/BillingSettings.test.tsx apps/web/modules/billing/BookingHistoryUpgradePrompt.tsx apps/web/modules/billing/BookingHistoryUpgradePrompt.test.tsx 'apps/web/app/(use-page-wrapper)/(main-nav)/booking/[uid]/logs/page.tsx'
git commit -m "feat(billing): restore contextual upgrades"
```

Expected: Biome clean, all type-check tasks pass, and the Task 3 PR changes five code files and fewer than 500 lines.

---

## Slice Verification Gate

After all three stacked tasks are independently reviewed, run:

```bash
TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/billing/usePaidPlanCheckout.test.tsx apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/billing/UpgradePromptProvider.test.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/billing/BillingSettings.test.tsx apps/web/modules/billing/BookingHistoryUpgradePrompt.test.tsx apps/web/modules/organizations/CreateOrganization.test.tsx
yarn type-check:ci --force
```

Expected: every focused suite passes and all Turbo type-check tasks pass. Manually verify a free user remains on `/booking/{uid}/logs` while the Team prompt is open, Escape returns focus to the gated surface, Polar cancellation retains the session intent, and a completed Team checkout reconciles the organization before returning to `/booking/{uid}/logs?upgrade=complete`.
