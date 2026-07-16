# Convenio UI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the approved invitation, organization-creation, and public-pricing UX gaps without changing monetization rules, checkout behavior, or destructive actions.

**Architecture:** Keep organization read policy in the existing tRPC handler and presentation state in the existing React panel. Reuse semantic UI tokens, route both pricing and onboarding through one small redirect-storage contract, and derive every displayed USD amount from the active i18n locale. Each task is independently reviewable and remains below 500 changed code lines and 10 changed code files.

**Tech Stack:** TypeScript, React, Next.js App Router, tRPC, Vitest, Testing Library, i18next, Tailwind semantic tokens, Biome.

## Global Constraints

- Preserve the approved dynamic-seat model: accepted members count as billed seats; pending invitations do not.
- Do not change Polar checkout, webhook processing, entitlement decisions, plan configuration, Prisma schema, dependencies, or generated files.
- Use existing semantic classes (`border-subtle`, `bg-subtle`, `text-emphasis`, `text-subtle`); add no blue/cyan/gradient utility classes.
- Add every new visible string to `packages/i18n/locales/en/common.json`.
- Use direct imports and `import type` for TypeScript-only imports; do not use `as any`.
- Run Biome, focused tests, and `yarn type-check:ci --force` before each implementation commit.
- Keep each task below 500 changed code lines and 10 changed code files; if a task exceeds either limit, stop and split it before committing.
- Destructive confirmation dialogs are explicitly deferred: the audit recommendation is outside the accepted scope, so this plan does not alter archive, remove-member, or revoke-invitation confirmation behavior.

---

### Task 1: Make organization membership states complete and archived organizations read-only

**Files:**
- Modify: `packages/trpc/server/routers/viewer/organizations/organizations.handler.ts`
- Test: `packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts`
- Modify: `apps/web/modules/organizations/OrganizationMembersPanel.tsx`
- Test: `apps/web/modules/organizations/OrganizationMembersPanel.test.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: `PrismaOrganizationReadRepository.getForMember(input: { organizationId: number; userId: number }): Promise<OrganizationReadModel>` and the existing `organizationMemberErrorKey(error: OrganizationMemberError): string` mapping.
- Produces: `OrganizationMembersView.isArchived: boolean`; archived views have `canManageInvitations: false` and `pendingInvitations: []` and never call `commands.listPendingInvitations`.
- Produces UI states: one inline translated mutation error, a `role="status"` loading state, email input hints, explicit accepted/pending empty states, and an archived read-only explanation.

- [ ] **Step 1: Write the failing handler regression for archived members**

Add this test beside the existing members-view tests in `organizations.handler.test.ts`:

```ts
it("returns archived members read-only without a pending provider lookup", async () => {
  const test = setup();
  test.read.getForMember.mockResolvedValue({
    ...organizationFor("OWNER"),
    archivedAt: new Date("2026-07-15T12:00:00.000Z"),
  });

  const result = await membersOrganizationHandler({
    ctx,
    dependencies: test.dependencies,
    input: { organizationId: 41 },
  });

  expect(result).toMatchObject({
    acceptedSeats: 4,
    actorRole: "OWNER",
    canManageInvitations: false,
    isArchived: true,
    pendingInvitations: [],
  });
  expect(test.commands.listPendingInvitations).not.toHaveBeenCalled();
});
```

Also add `isArchived: false` to the expected object in the existing `"returns safe members and pending invitations to an %s"` test. This prevents the new field from being accidentally omitted on active organizations.

- [ ] **Step 2: Run the handler test to verify RED**

Run:

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts
```

Expected: FAIL because `isArchived` is absent and the archived owner still receives invitation-management capability/provider data.

- [ ] **Step 3: Add the archived read policy to the handler**

Add the Boolean to `OrganizationMembersView`:

```ts
type OrganizationMembersView = {
  acceptedSeats: number;
  actorRole: OrganizationMemberRole;
  canManageInvitations: boolean;
  id: number;
  isArchived: boolean;
  members: Array<{
    avatarUrl: string | null;
    email: string;
    id: number;
    name: string | null;
    role: OrganizationMemberRole;
  }>;
  name: string;
  pendingInvitations: Array<{
    createdAt: Date;
    email: string;
    id: string;
    role: "ADMIN" | "MEMBER";
  }>;
  seatLimit: number;
  slug: string | null;
};
```

In `membersOrganizationHandler`, derive archive state before capability and include it in the safe view:

```ts
const entitlements = await dependencies.entitlements.forOrganization(organization.id);
const isArchived = organization.archivedAt !== null;
const isManager = actor.role === "OWNER" || actor.role === "ADMIN";
const canManageInvitations = !isArchived && isManager && entitlements.canInviteOrganizationMembers;
let pendingInvitations: PendingOrganizationInvitation[] = [];
if (canManageInvitations) {
  pendingInvitations = await dependencies.commands.listPendingInvitations({
    actorUserId: options.ctx.user.id,
    organizationId: organization.id,
  });
}
```

Add `isArchived` next to `id` in the returned object. Do not filter archived organizations out of the local read: accepted members must still receive their accepted member list and seat count.

- [ ] **Step 4: Run the handler test to verify GREEN**

Run:

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts
```

Expected: PASS, including the archived no-provider-call assertion.

- [ ] **Step 5: Write failing component tests for the five UI gaps**

Extend the hoisted test state so the query can be driven into loading state and mutation errors can be invoked:

```ts
type MutationOptions = {
  onError?(error: { data?: { code?: string } | null; message: string }): void;
  onMutate?(): void;
  onSuccess?(): Promise<void> | void;
};

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  mutate: {
    changeRole: vi.fn(),
    invite: vi.fn(),
    removeMember: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  },
  options: {} as Partial<Record<MutationName, MutationOptions>>,
  pending: undefined as MutationName | undefined,
  queryPending: false,
}));
```

Add `act` to the existing Testing Library import. Make the mocked query return `isPending: mocks.queryPending`, reset it to `false` in `beforeEach`, and add `isArchived: false` to `membersData`. Then add these tests:

```tsx
it("announces loading and gives the invitation email field browser hints", () => {
  mocks.queryPending = true;
  const loading = renderPanel();
  expect(screen.getByRole("status", { name: "loading" })).toBeVisible();

  loading.unmount();
  mocks.queryPending = false;
  renderPanel();
  const email = screen.getByRole("textbox", { name: "Email address" });
  expect(email).toHaveAttribute("autocomplete", "email");
  expect(email).toHaveAttribute("spellcheck", "false");
});

it.each([
  [{ message: "An invitation is already pending for this email" }, english.organization_members_error_duplicate],
  [{ message: "This plan's resource limit was reached" }, english.organization_members_error_full],
  [{ data: { code: "BAD_REQUEST" }, message: "invalid" }, english.organization_members_error_invalid],
  [{ data: { code: "FORBIDDEN" }, message: "denied" }, english.organization_members_error_permission],
  [{ data: { code: "CONFLICT" }, message: "provider" }, english.organization_members_error_provider],
])("renders a mapped invitation failure inline", (error, message) => {
  renderPanel();
  act(() => mocks.options.invite?.onError?.(error));
  expect(screen.getByRole("alert")).toHaveTextContent(message);
});

it("renders accepted and pending empty states", () => {
  renderPanel({ ...membersData, acceptedSeats: 0, members: [], pendingInvitations: [] });
  expect(screen.getByText(english.organization_members_accepted_empty)).toBeVisible();
  expect(screen.getByText(english.organization_members_pending_empty)).toBeVisible();
});

it("explains archived membership as read-only and hides all mutation controls", () => {
  renderPanel({
    ...membersData,
    canManageInvitations: false,
    isArchived: true,
    pendingInvitations: [],
  });

  expect(screen.getByText(english.organization_members_archived_read_only)).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Email address" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Remove|Resend|Revoke/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run the component test to verify RED**

Run:

```bash
TZ=UTC yarn test apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
```

Expected: FAIL because mutation errors use toasts, the loader has no status role, the email hints and empty copy are absent, and `isArchived` has no dedicated presentation.

- [ ] **Step 7: Implement inline errors, accessibility hints, and complete states**

Remove the `showToast` import. Add shared mutation-error state and translate the existing mapping only at render time:

```ts
const [emailError, setEmailError] = useState<string>();
const [mutationErrorKey, setMutationErrorKey] = useState<string>();
const onError = (error: OrganizationMemberError): void => {
  setMutationErrorKey(organizationMemberErrorKey(error));
};
const mutationOptions = {
  onError,
  onMutate: () => setMutationErrorKey(undefined),
  onSuccess: async () => {
    setMutationErrorKey(undefined);
    await invalidate();
  },
};
```

Keep the invite-specific email reset in its `onSuccess`; `onMutate` clears an old inline error before every invite, resend, revoke, role-change, or removal retry. Render the error once near the top of the panel:

```tsx
{mutationErrorKey ? <Alert message={t(mutationErrorKey)} severity="error" /> : null}
```

Replace the loading node and add the email attributes:

```tsx
if (query.isPending)
  return (
    <div
      aria-label={t("loading")}
      className="bg-subtle h-72 animate-pulse rounded-xl"
      role="status"
    />
  );
```

```tsx
<TextField
  autoComplete="email"
  disabled={!canInvite || invite.isPending}
  label={t("organization_members_email")}
  name="email"
  onChange={(event) => setEmail(event.target.value)}
  placeholder="name@example.com"
  spellCheck={false}
  type="email"
  value={email}
/>
```

Give archive state first priority so it cannot be mistaken for an inactive Team plan:

```tsx
let managementState: ReactNode = null;
if (data.isArchived) {
  managementState = <Alert message={t("organization_members_archived_read_only")} severity="info" />;
} else if (!isManager) {
  managementState = <Alert message={t("organization_members_read_only")} severity="info" />;
} else if (!data.canManageInvitations) {
  managementState = <Alert message={t("organization_members_team_required")} severity="warning" />;
}
```

Inside the accepted and pending sections, render the list only when it has items; otherwise render these paragraphs:

```tsx
<p className="p-5 text-sm text-subtle">{t("organization_members_accepted_empty")}</p>
```

```tsx
<p className="p-5 text-sm text-subtle">{t("organization_members_pending_empty")}</p>
```

Add the exact English strings in alphabetical position in `common.json`:

```json
"organization_members_accepted_empty": "No accepted members yet.",
"organization_members_archived_read_only": "This organization is archived. Member details are read-only.",
"organization_members_pending_empty": "No pending invitations."
```

- [ ] **Step 8: Run focused tests, formatting, and type checks**

Run:

```bash
yarn biome check --write packages/trpc/server/routers/viewer/organizations/organizations.handler.ts packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.tsx apps/web/modules/organizations/OrganizationMembersPanel.test.tsx packages/i18n/locales/en/common.json
TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
yarn type-check:ci --force
git diff --stat
```

Expected: Biome exits 0; both test files pass; type-check exits 0; the diff contains 5 code files and fewer than 500 changed code lines.

- [ ] **Step 9: Commit the invitation hardening slice**

```bash
git add packages/trpc/server/routers/viewer/organizations/organizations.handler.ts packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.tsx apps/web/modules/organizations/OrganizationMembersPanel.test.tsx packages/i18n/locales/en/common.json
git commit -m "fix: harden organization member states"
```

---

### Task 2: Remove residual blue styling from organization creation

**Files:**
- Modify: `apps/web/modules/organizations/CreateOrganization.tsx`
- Test: `apps/web/modules/organizations/CreateOrganization.test.tsx`

**Interfaces:**
- Consumes: existing semantic Tailwind tokens only.
- Produces: an owner/team information panel using `border-subtle bg-subtle text-emphasis` and an icon using `text-subtle`; no functional interface changes.

- [ ] **Step 1: Write the failing semantic-token regression**

Add this test to the `CreateOrganization checkout` describe block:

```tsx
it("uses semantic tokens for the owner and Team information panel", () => {
  const view = render(<CreateOrganization returnTo="/settings/organizations" />);
  const ownerCopy = view.getByText("organization_bootstrap_owner_only");
  const panel = ownerCopy.closest("div.border");

  expect(panel).toHaveClass("border-subtle", "bg-subtle", "text-emphasis");
  expect(view.container.innerHTML).not.toMatch(/(?:border|bg|text)-blue-/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
TZ=UTC yarn test apps/web/modules/organizations/CreateOrganization.test.tsx
```

Expected: FAIL because the panel still contains `border-blue-*`, `bg-blue-*`, and `text-blue-*` classes.

- [ ] **Step 3: Replace color-specific utilities with existing semantic tokens**

Replace the information panel opening nodes with:

```tsx
<div className="border-subtle bg-subtle text-emphasis mb-7 flex gap-3 rounded-xl border p-4">
  <Icon className="text-subtle mt-0.5 h-5 w-5 shrink-0" name="users" />
```

Keep the copy, spacing, icon, and behavior unchanged; do not add a new token or dependency.

- [ ] **Step 4: Run verification and inspect the focused diff**

Run:

```bash
yarn biome check --write apps/web/modules/organizations/CreateOrganization.tsx apps/web/modules/organizations/CreateOrganization.test.tsx
TZ=UTC yarn test apps/web/modules/organizations/CreateOrganization.test.tsx
yarn type-check:ci --force
git diff --stat
```

Expected: test and type-check pass; the diff contains 2 code files and fewer than 500 changed code lines.

- [ ] **Step 5: Commit the semantic styling slice**

```bash
git add apps/web/modules/organizations/CreateOrganization.tsx apps/web/modules/organizations/CreateOrganization.test.tsx
git commit -m "fix: use semantic organization setup colors"
```

---

### Task 3: Complete public pricing accessibility, locale formatting, and signup return consumption

**Files:**
- Create: `apps/web/modules/onboarding/lib/onboardingRedirect.ts`
- Modify: `apps/web/modules/billing/Pricing.tsx`
- Test: `apps/web/modules/billing/Pricing.test.tsx`
- Modify: `apps/web/modules/billing/PlanSelector.tsx`
- Test: `apps/web/modules/billing/PlanSelector.test.tsx`
- Modify: `apps/web/modules/onboarding/hooks/useSubmitPersonalOnboarding.ts`
- Test: `apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Produces: `storeOnboardingRedirect(redirectUrl: string): void`, `consumeOnboardingRedirect(): string | null`, and `ONBOARDING_REDIRECT_KEY = "onBoardingRedirect"` from `apps/web/modules/onboarding/lib/onboardingRedirect.ts`.
- Produces: `formatPrice(amountInCents: number, locale: string): string` inside `PlanSelector.tsx`; every Pro, Team, weekly-equivalent, and Free amount passes `i18n.language` and currency remains USD.
- Produces: anonymous pricing landmark `id="pricing-main-content"` and a translated skip link targeting it.

- [ ] **Step 1: Write failing locale-formatting tests, including Free**

Hoist the mocked locale in `PlanSelector.test.tsx` and return it from `useLocale`:

```ts
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
          billing_team_roles:
            "Round-robin and collective scheduling — Find a time across the right people.",
          billing_team_scheduling: "Shared event types — Give the team one set of booking rules.",
          billing_weekly_member_equivalent:
            "{{price}} per accepted member per week when billed yearly",
        }[key] ?? key;
      return values ? translated.replace("{{price}}", values.price) : translated;
    },
  }),
}));
```

Add `beforeEach(() => { mocks.language = "en-US"; });`, then add:

```tsx
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

  expect(view.getByText(yearlyPro)).toBeInTheDocument();
  fireEvent.click(view.getByRole("button", { name: "billing_view_all_plans" }));
  expect(view.getByText(free)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the PlanSelector test to verify RED**

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx
```

Expected: FAIL because paid prices force `en-US` and Free is hard-coded as `$0`.

- [ ] **Step 3: Thread the active locale through every price**

Change the formatter and hook destructuring:

```ts
function formatPrice(amountInCents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    maximumFractionDigits: amountInCents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(amountInCents / 100);
}
```

```ts
const { i18n, t } = useLocale();
const locale = i18n.language || "en-US";
```

Replace both paid calls with `formatPrice(price.amountInCents, locale)` and `formatPrice(Math.round(price.amountInCents / 52), locale)`. Replace the Free literal with:

```tsx
<p className="font-mono mt-6 text-4xl font-semibold tracking-tight">{formatPrice(0, locale)}</p>
```

- [ ] **Step 4: Run the PlanSelector test to verify GREEN**

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx
```

Expected: PASS for the existing English expectations and the new German-locale paid/Free expectations.

- [ ] **Step 5: Write the failing public skip-link test**

Add `skip_to_main_content: "Skip to main content"` to the locale mock in `Pricing.test.tsx`, then add:

```tsx
it("offers anonymous keyboard users a skip link to the pricing content", () => {
  const view = render(<Pricing isAuthenticated={false} onSelectPlan={vi.fn()} />);
  const skipLink = view.getByRole("link", { name: "Skip to main content" });
  const main = view.getByRole("main");

  expect(skipLink).toHaveAttribute("href", "#pricing-main-content");
  expect(skipLink).toHaveClass("sr-only", "focus:not-sr-only");
  expect(main).toHaveAttribute("id", "pricing-main-content");
  expect(main).toHaveAttribute("tabindex", "-1");
});
```

- [ ] **Step 6: Run the Pricing test to verify RED**

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/Pricing.test.tsx
```

Expected: FAIL because anonymous pricing has no skip link or target landmark.

- [ ] **Step 7: Add the translated skip link and focus target**

Insert this as the first child of the anonymous `.cv-root`, before `MarketingHeader`:

```tsx
<a
  className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-default focus:px-4 focus:py-2 focus:text-emphasis focus:shadow-md focus:outline-none focus:ring-2 focus:ring-emphasis"
  href="#pricing-main-content">
  {t("skip_to_main_content")}
</a>
```

Change the public main opening tag to:

```tsx
<main className="cv-container" id="pricing-main-content" tabIndex={-1}>
```

Add this exact translation in alphabetical position in `common.json`:

```json
"skip_to_main_content": "Skip to main content"
```

- [ ] **Step 8: Write the failing cross-module redirect-consumption regression**

Create `apps/web/modules/onboarding/lib/onboardingRedirect.ts` with only the exported contract signatures so imports compile but behavior remains RED:

```ts
const ONBOARDING_REDIRECT_KEY = "onBoardingRedirect";

function storeOnboardingRedirect(_redirectUrl: string): void {}

function consumeOnboardingRedirect(): string | null {
  return null;
}

export { consumeOnboardingRedirect, ONBOARDING_REDIRECT_KEY, storeOnboardingRedirect };
```

Use `storeOnboardingRedirect("/pricing")` in the anonymous branch of `PricingPage` and `consumeOnboardingRedirect()` in `useSubmitPersonalOnboarding` in place of their direct localStorage operations. In the onboarding hook test, import the shared key, clear local storage in `beforeEach`, and add:

```ts
import { ONBOARDING_REDIRECT_KEY } from "../../lib/onboardingRedirect";

it("consumes the pricing signup redirect after personal onboarding", async () => {
  localStorage.setItem(ONBOARDING_REDIRECT_KEY, "/pricing");
  const { result } = renderHook(() => useSubmitPersonalOnboarding());

  await act(() => result.current.submitPersonalOnboarding());

  expect(mocks.push).toHaveBeenCalledWith("/pricing");
  expect(localStorage.getItem(ONBOARDING_REDIRECT_KEY)).toBeNull();
});
```

Keep the existing pricing producer assertion (`onBoardingRedirect` equals `/pricing` before navigation) unchanged; together, the producer and real onboarding-hook consumer tests guard both modules against key drift.

- [ ] **Step 9: Run producer and consumer tests to verify RED**

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/Pricing.test.tsx apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts
```

Expected: the skip-link test now passes; redirect tests FAIL because the stub neither stores nor consumes the value.

- [ ] **Step 10: Implement the minimal shared redirect contract**

Replace the stub functions in `onboardingRedirect.ts` with:

```ts
const ONBOARDING_REDIRECT_KEY = "onBoardingRedirect";

function storeOnboardingRedirect(redirectUrl: string): void {
  localStorage.setItem(ONBOARDING_REDIRECT_KEY, redirectUrl);
}

function consumeOnboardingRedirect(): string | null {
  const redirectUrl = localStorage.getItem(ONBOARDING_REDIRECT_KEY);
  if (!redirectUrl) return null;
  localStorage.removeItem(ONBOARDING_REDIRECT_KEY);
  return redirectUrl;
}

export { consumeOnboardingRedirect, ONBOARDING_REDIRECT_KEY, storeOnboardingRedirect };
```

Import directly from `@calcom/web/modules/onboarding/lib/onboardingRedirect` in `Pricing.tsx` and from `../lib/onboardingRedirect` in `useSubmitPersonalOnboarding.ts`. The hook keeps its existing same control flow: if consumption returns a URL, push it and return; otherwise continue to the organization-modal/welcome routing.

- [ ] **Step 11: Run all Task 3 verification**

Run:

```bash
yarn biome check --write apps/web/modules/onboarding/lib/onboardingRedirect.ts apps/web/modules/billing/Pricing.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/billing/PlanSelector.tsx apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/onboarding/hooks/useSubmitPersonalOnboarding.ts apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts packages/i18n/locales/en/common.json
TZ=UTC yarn test apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts
yarn type-check:ci --force
git diff --stat
```

Expected: Biome exits 0; all three focused test files pass; type-check exits 0; the diff contains 8 code files and fewer than 500 changed code lines.

- [ ] **Step 12: Commit the public pricing hardening slice**

```bash
git add apps/web/modules/onboarding/lib/onboardingRedirect.ts apps/web/modules/billing/Pricing.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/billing/PlanSelector.tsx apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/onboarding/hooks/useSubmitPersonalOnboarding.ts apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts packages/i18n/locales/en/common.json
git commit -m "fix: harden public pricing journey"
```

---

## Final Review Gate

- [ ] Confirm `git diff --check` exits 0.
- [ ] Confirm `rg -n '(bg|border|text)-(blue|cyan)-' apps/web/modules/organizations/CreateOrganization.tsx` returns no matches.
- [ ] Confirm the archived handler test proves `listPendingInvitations` is not called.
- [ ] Confirm invitation errors are asserted through rendered `role="alert"` content, not a toast mock.
- [ ] Confirm both paid and Free prices use the mocked active locale.
- [ ] Confirm pricing writes `/pricing`, onboarding consumes it, removes the key, and navigates to `/pricing`.
- [ ] Confirm no task changes destructive confirmation behavior and no task exceeds 500 changed code lines or 10 changed code files.
- [ ] Run the complete final command set:

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts apps/web/modules/organizations/OrganizationMembersPanel.test.tsx apps/web/modules/organizations/CreateOrganization.test.tsx apps/web/modules/billing/PlanSelector.test.tsx apps/web/modules/billing/Pricing.test.tsx apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts
yarn type-check:ci --force
git diff --check
```

Expected: all six focused test files pass, type-check exits 0, and `git diff --check` prints no output.
