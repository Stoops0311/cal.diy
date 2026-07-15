# Convenio Team-Aware Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace onboarding's plan-shaped first step with an honest three-way setup intent, carry accepted organization context through personal setup, let owners create a Clerk-backed team, and finish with a skippable, team-aware plan decision.

**Architecture:** Persist setup intent separately from the legacy billing-shaped onboarding state, while deriving accepted organization membership from a narrow server-only Prisma read model on every relevant route. Keep personal profile/calendar steps intact, add a Clerk organization bootstrap step for `bring-team`, and add a final completion surface that uses the existing `PlanSelector` and `usePaidPlanCheckout` without changing Polar, entitlements, or the upgrade-intent allowlist.

**Tech Stack:** Next.js App Router, React 18, TypeScript, Zustand persist with IndexedDB, Prisma, tRPC, Clerk organization commands, Polar checkout, Vitest/Testing Library, Playwright, Biome.

## Global Constraints

- The user approved the overall design and recommendations. Cross-package execution is limited to the exact `apps/web`, `packages/features/auth`, and translation files named in this plan; do not expand the authorization scope.
- Keep every implementation commit below 500 changed code lines and at or below 10 code files. Translation and plan files do not count as code files under the repository guidance.
- Intent is not billing state. Never derive `intent` from `selectedPlan`, and do not delete legacy onboarding fields used by older paths.
- Only an accepted, unarchived organization membership establishes team context. Do not claim that Prisma can discover a pending Clerk invitation.
- Create-team must call the existing Clerk-backed `viewer.organizations.create` mutation. Do not introduce a second organization or invitation store.
- There is no reusable organization invitation panel or valid organization-members settings route in this slice. End the bring-team flow at the persisted, reconciled organization boundary; invitation UI belongs to the later members slice.
- `Keep working free` is always visible on the completion screen, always completes onboarding, and is never gated by checkout.
- Complete onboarding and default event-type setup before leaving for Polar. Checkout failure must leave the free action available.
- Do not extend `upgradeIntent.ts` with an onboarding-shaped fake capability or resume action.
- All new UI strings go in `packages/i18n/locales/en/common.json` and use Convenio's short, declarative voice. Do not use “unlock,” “most popular,” fabricated adoption, or unsupported urgency.
- Use explicit Prisma `select`, direct source imports, type-only imports, existing UI components, and existing design tokens.
- Every task begins with failing focused tests, ends with Biome plus focused tests, and receives an independent review before the next task.

## File Structure

- `apps/web/modules/onboarding/store/onboarding-store.ts` owns persisted setup intent and the newly created organization handoff. It retains all legacy plan/team fields.
- `apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.ts` is the only membership-to-onboarding adapter. It returns a minimal safe DTO and prefers the active session organization.
- `apps/web/app/(use-page-wrapper)/onboarding/getting-started/page.tsx` authenticates, loads accepted organization context, and renders the first intent decision.
- `apps/web/modules/onboarding/getting-started/onboarding-view.tsx` owns the three-way intent interaction and missing-invitation recovery; it does not know billing plans.
- `apps/web/app/(use-page-wrapper)/onboarding/team/page.tsx` and `apps/web/modules/onboarding/team/bring-team-view.tsx` own Clerk-backed team creation inside the onboarding namespace.
- `apps/web/app/(use-page-wrapper)/onboarding/complete/page.tsx` and `apps/web/modules/onboarding/complete/completion-view.tsx` own the final recap, paid selection, and unconditional free completion.
- `apps/web/modules/onboarding/hooks/useSubmitPersonalOnboarding.ts` owns the one completion sequence used by both free and paid actions.
- `apps/web/playwright/onboarding.e2e.ts` verifies the complete free path after unit-level intent and team variants are green.

---

### Task 1: Persist Intent and Derive Accepted Organization Context

**Files:**
- Modify: `apps/web/modules/onboarding/store/onboarding-store.ts`
- Create: `apps/web/modules/onboarding/store/onboarding-store.test.ts`
- Create: `apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.ts`
- Create: `apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.test.ts`
- Modify: `apps/web/app/(use-page-wrapper)/onboarding/getting-started/page.tsx`
- Modify: `apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.tsx`
- Create: `apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.test.ts`
- Modify: `packages/features/auth/lib/onboardingUtils.ts`
- Create: `packages/features/auth/lib/onboardingUtils.test.ts`

**Interfaces:**
- Consumes: `getServerSession({ req })`, the existing Prisma client, `MembershipRole`, and the existing Zustand `OnboardingState`.
- Produces:

```ts
export type OnboardingIntent = "solo" | "join-team" | "bring-team";

export type CreatedOrganizationContext = {
  id: number;
  name: string;
  slug: string;
};

export type AcceptedOrganizationContext = {
  id: number;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  slug: string | null;
};

export async function getAcceptedOrganizationContexts(input: {
  preferredOrganizationId?: number;
  userId: number;
}): Promise<AcceptedOrganizationContext[]>;
```

- `OnboardingState` gains `intent`, `createdOrganization`, `setIntent`, and `setCreatedOrganization`. Store persistence version becomes `2`.
- `shouldShowOnboarding` depends on `createdDate` and `completedOnboarding`, not organization presence.
- `checkOnboardingRedirect` returns `/onboarding/getting-started` for an incomplete v3 user even when the user has an accepted organization membership.

- [ ] **Step 1: Write failing store migration tests**

Create `apps/web/modules/onboarding/store/onboarding-store.test.ts` with a pure migration assertion. Export `migrateOnboardingState` from the store so tests do not need IndexedDB:

```ts
import { describe, expect, it } from "vitest";

import { migrateOnboardingState } from "./onboarding-store";

describe("migrateOnboardingState", () => {
  it("adds intent fields without inferring them from the legacy selected plan", () => {
    const migrated = migrateOnboardingState(
      {
        selectedPlan: "team",
        personalDetails: { avatar: null, bio: "", name: "Ada", timezone: "UTC", username: "ada" },
      },
      1
    );

    expect(migrated).toMatchObject({
      createdOrganization: null,
      intent: null,
      selectedPlan: "team",
    });
  });

  it("keeps a version-two intent and created organization", () => {
    const persisted = {
      createdOrganization: { id: 41, name: "Operations", slug: "operations" },
      intent: "bring-team",
      selectedPlan: "personal",
    };

    expect(migrateOnboardingState(persisted, 2)).toEqual(persisted);
  });
});
```

- [ ] **Step 2: Run the store test and verify failure**

Run:

```bash
TZ=UTC yarn test apps/web/modules/onboarding/store/onboarding-store.test.ts
```

Expected: FAIL because `migrateOnboardingState` is not exported.

- [ ] **Step 3: Add version-two intent state and migration**

Add the exact state types and actions to `onboarding-store.ts`:

```ts
export type OnboardingIntent = "solo" | "join-team" | "bring-team";

export type CreatedOrganizationContext = {
  id: number;
  name: string;
  slug: string;
};

export interface OnboardingState {
  selectedPlan: PlanType | null;
  intent: OnboardingIntent | null;
  createdOrganization: CreatedOrganizationContext | null;
  setIntent: (intent: OnboardingIntent) => void;
  setCreatedOrganization: (organization: CreatedOrganizationContext | null) => void;
}
```

Extend `initialState` and the Zustand actions:

```ts
const initialState = {
  selectedPlan: "personal" as PlanType,
  intent: null as OnboardingIntent | null,
  createdOrganization: null as CreatedOrganizationContext | null,
};

setIntent: (intent) => set({ intent }),
setCreatedOrganization: (createdOrganization) => set({ createdOrganization }),
```

Replace the inline migration with a pure function while retaining the existing oversized-image cleanup:

```ts
export function migrateOnboardingState(persistedState: unknown, version: number): Partial<OnboardingState> {
  const state = persistedState as Partial<OnboardingState>;
  if (version < 1) {
    if (state.organizationBrand && isOversizedImage(state.organizationBrand.logo, LOGO_SIZE_THRESHOLD)) {
      state.organizationBrand.logo = null;
    }
    if (state.organizationBrand && isOversizedImage(state.organizationBrand.banner, BANNER_SIZE_THRESHOLD)) {
      state.organizationBrand.banner = null;
    }
    if (state.teamBrand && isOversizedImage(state.teamBrand.logo, LOGO_SIZE_THRESHOLD)) {
      state.teamBrand.logo = null;
    }
    if (state.personalDetails && isOversizedImage(state.personalDetails.avatar, LOGO_SIZE_THRESHOLD)) {
      state.personalDetails.avatar = null;
    }
  }
  if (version < 2) {
    return { ...state, createdOrganization: null, intent: null };
  }
  return state;
}
```

Set `version: 2`, call `migrateOnboardingState`, and add `intent` plus `createdOrganization` to `partialize`. Do not change or remove `selectedPlan`.

- [ ] **Step 4: Run the store test and verify pass**

Run:

```bash
TZ=UTC yarn test apps/web/modules/onboarding/store/onboarding-store.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Write failing accepted-organization helper tests**

Create `getAcceptedOrganizationContexts.test.ts` with a mocked Prisma result and query-shape assertion:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: { membership: { findMany: mocks.findMany } },
}));

import { getAcceptedOrganizationContexts } from "./getAcceptedOrganizationContexts";

describe("getAcceptedOrganizationContexts", () => {
  beforeEach(() => mocks.findMany.mockReset());

  it("queries only accepted, unarchived organizations with a narrow select", async () => {
    mocks.findMany.mockResolvedValue([]);

    await getAcceptedOrganizationContexts({ userId: 7 });

    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: { teamId: "asc" },
      select: {
        role: true,
        team: { select: { id: true, name: true, slug: true } },
      },
      where: {
        accepted: true,
        team: { archivedAt: null, isOrganization: true },
        userId: 7,
      },
    });
  });

  it("puts the active session organization first without returning provider identifiers", async () => {
    mocks.findMany.mockResolvedValue([
      { role: "MEMBER", team: { id: 20, name: "Field", slug: "field" } },
      { role: "OWNER", team: { id: 41, name: "Operations", slug: "operations" } },
    ]);

    await expect(
      getAcceptedOrganizationContexts({ preferredOrganizationId: 41, userId: 7 })
    ).resolves.toEqual([
      { id: 41, name: "Operations", role: "OWNER", slug: "operations" },
      { id: 20, name: "Field", role: "MEMBER", slug: "field" },
    ]);
  });
});
```

- [ ] **Step 6: Run the helper test and verify failure**

Run:

```bash
TZ=UTC yarn test apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 7: Implement the narrow accepted-organization helper**

Create `getAcceptedOrganizationContexts.ts`:

```ts
import { prisma } from "@calcom/prisma";

export type AcceptedOrganizationContext = {
  id: number;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  slug: string | null;
};

export async function getAcceptedOrganizationContexts({
  preferredOrganizationId,
  userId,
}: {
  preferredOrganizationId?: number;
  userId: number;
}): Promise<AcceptedOrganizationContext[]> {
  const memberships = await prisma.membership.findMany({
    orderBy: { teamId: "asc" },
    select: {
      role: true,
      team: { select: { id: true, name: true, slug: true } },
    },
    where: {
      accepted: true,
      team: { archivedAt: null, isOrganization: true },
      userId,
    },
  });
  const contexts = memberships.map(({ role, team }) => ({ ...team, role }));
  if (!preferredOrganizationId) return contexts;
  return contexts.sort((left, right) => {
    if (left.id === preferredOrganizationId) return -1;
    if (right.id === preferredOrganizationId) return 1;
    return left.id - right.id;
  });
}
```

- [ ] **Step 8: Pass accepted context from the first route**

In `onboarding/getting-started/page.tsx`, remove `MembershipRepository.hasAnyTeamMembershipByUserId` and its redirect. Load contexts after authentication:

```tsx
const acceptedOrganizations = await getAcceptedOrganizationContexts({
  preferredOrganizationId: session.user.org?.id,
  userId: session.user.id,
});

return (
  <OnboardingView
    acceptedOrganization={acceptedOrganizations[0] ?? null}
    userEmail={session.user.email ?? ""}
  />
);
```

Pending memberships are deliberately absent from this contract.

- [ ] **Step 9: Write failing auth redirect tests**

Export `shouldShowOnboarding` from the client hook. Create `useRedirectToOnboardingIfNeeded.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { shouldShowOnboarding } from "./useRedirectToOnboardingIfNeeded";

describe("shouldShowOnboarding", () => {
  it("does not skip an incomplete user because an organization profile is active", () => {
    expect(
      shouldShowOnboarding({ completedOnboarding: false, createdDate: new Date("2026-01-01") })
    ).toBe(true);
  });

  it("does not reopen onboarding after completion", () => {
    expect(
      shouldShowOnboarding({ completedOnboarding: true, createdDate: new Date("2026-01-01") })
    ).toBe(false);
  });
});
```

Add server helper coverage in `onboardingUtils.test.ts` by mocking `UserRepository`, `FeaturesRepository`, and their methods. The central assertion is:

```ts
await expect(
  checkOnboardingRedirect(7, { organizationId: 41 })
).resolves.toBe("/onboarding/getting-started");
```

Configure `UserRepository.findById` to resolve `{ completedOnboarding: false, createdDate: new Date("2026-01-01"), emailVerified: new Date(), identityProvider: "CAL" }` and `FeaturesRepository.checkIfFeatureIsEnabledGlobally` to resolve `true` only for `"onboarding-v3"`.

- [ ] **Step 10: Run auth tests and verify failure**

Run:

```bash
TZ=UTC yarn test apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.test.ts packages/features/auth/lib/onboardingUtils.test.ts
```

Expected: FAIL because organization presence currently suppresses onboarding.

- [ ] **Step 11: Remove membership-based onboarding bypasses**

In the client hook, narrow the pure predicate:

```ts
export const shouldShowOnboarding = (
  user: Pick<User, "createdDate" | "completedOnboarding">
) => !user.completedOnboarding && dayjs(user.createdDate).isAfter(ONBOARDING_INTRODUCED_AT);
```

In `checkOnboardingRedirect`, remove the profile-organization exclusion and the direct-membership redirect. The terminal choice becomes:

```ts
const onboardingV3Enabled =
  await featuresRepository.checkIfFeatureIsEnabledGlobally("onboarding-v3");

return onboardingV3Enabled ? "/onboarding/getting-started" : "/getting-started";
```

Keep the `organizationId` option in the public signature for caller compatibility, but do not use it to skip onboarding. Remove unused `ProfileRepository` and `MembershipRepository` imports.

- [ ] **Step 12: Run Task 1 verification**

Run:

```bash
yarn biome check --write apps/web/modules/onboarding/store/onboarding-store.ts apps/web/modules/onboarding/store/onboarding-store.test.ts apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.ts apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.test.ts 'apps/web/app/(use-page-wrapper)/onboarding/getting-started/page.tsx' apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.tsx apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.test.ts packages/features/auth/lib/onboardingUtils.ts packages/features/auth/lib/onboardingUtils.test.ts
TZ=UTC yarn test apps/web/modules/onboarding/store/onboarding-store.test.ts apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.test.ts apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.test.ts packages/features/auth/lib/onboardingUtils.test.ts
```

Expected: Biome clean; all focused tests PASS.

- [ ] **Step 13: Commit Task 1**

```bash
git add apps/web/modules/onboarding/store/onboarding-store.ts apps/web/modules/onboarding/store/onboarding-store.test.ts apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.ts apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.test.ts 'apps/web/app/(use-page-wrapper)/onboarding/getting-started/page.tsx' apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.tsx apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.test.ts packages/features/auth/lib/onboardingUtils.ts packages/features/auth/lib/onboardingUtils.test.ts
git commit -m "feat(onboarding): separate setup intent state"
```

---

### Task 2: Replace Plan Selection with the Three-Way Intent Decision

**Files:**
- Modify: `apps/web/modules/onboarding/getting-started/onboarding-view.tsx`
- Create: `apps/web/modules/onboarding/getting-started/onboarding-view.test.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: `AcceptedOrganizationContext`, `OnboardingIntent`, `useOnboardingStore().setIntent`, and `router.push`.
- Produces: `OnboardingView({ acceptedOrganization, userEmail })`, which routes only to `/onboarding/personal/settings` or `/onboarding/team`.

- [ ] **Step 1: Write failing intent-screen tests**

Create `onboarding-view.test.tsx`. Mock locale, router, the onboarding store, layout animation, and PostHog. Cover exact copy and each route:

```tsx
it("keeps setup intent separate from billing plan state", () => {
  render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);

  expect(screen.getByRole("radio", { name: "I work on my own" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "I am joining a team" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "I am bringing a team" })).toBeVisible();
  expect(mocks.setSelectedPlan).not.toHaveBeenCalled();
});

it("continues solo through personal setup", async () => {
  render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);
  await userEvent.click(screen.getByRole("radio", { name: "I work on my own" }));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(mocks.setIntent).toHaveBeenCalledWith("solo");
  expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
});

it("shows accepted team context before personal setup", async () => {
  render(
    <OnboardingView
      acceptedOrganization={{ id: 41, name: "Operations", role: "MEMBER", slug: "operations" }}
      userEmail="ada@example.com"
    />
  );
  await userEvent.click(screen.getByRole("radio", { name: "I am joining a team" }));
  expect(screen.getByText("You’re joining Operations.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
});

it("uses invitation-link recovery when no accepted membership exists", async () => {
  render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);
  await userEvent.click(screen.getByRole("radio", { name: "I am joining a team" }));
  expect(screen.getByText("Your invitation opens the team.")).toBeVisible();
  expect(screen.getByText(/Use the invitation link in your email/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Continue on my own" }));
  expect(mocks.setIntent).toHaveBeenCalledWith("join-team");
  expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
});

it("routes team creators to the Clerk bootstrap step", async () => {
  render(<OnboardingView acceptedOrganization={null} userEmail="ada@example.com" />);
  await userEvent.click(screen.getByRole("radio", { name: "I am bringing a team" }));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(mocks.setIntent).toHaveBeenCalledWith("bring-team");
  expect(mocks.push).toHaveBeenCalledWith("/onboarding/team");
});
```

- [ ] **Step 2: Run the intent tests and verify failure**

Run:

```bash
TZ=UTC yarn test apps/web/modules/onboarding/getting-started/onboarding-view.test.tsx
```

Expected: FAIL because the old screen renders plan names and nonexistent routes.

- [ ] **Step 3: Replace plan-shaped state and presentation**

Change the component signature and local state:

```tsx
type OnboardingViewProps = {
  acceptedOrganization: AcceptedOrganizationContext | null;
  userEmail: string;
};

const [selection, setSelection] = useState<OnboardingIntent | null>(null);
const [showInviteRecovery, setShowInviteRecovery] = useState(false);
const { setIntent } = useOnboardingStore();
```

Render three `RadioAreaGroup.Item` controls with these translation-backed labels and support lines:

```ts
const intents = [
  { id: "solo", title: "onboarding_intent_solo", description: "onboarding_intent_solo_description" },
  { id: "join-team", title: "onboarding_intent_join", description: "onboarding_intent_join_description" },
  { id: "bring-team", title: "onboarding_intent_bring", description: "onboarding_intent_bring_description" },
] as const;
```

Use this exact continuation logic:

```ts
function handleContinue(): void {
  if (!selection) return;
  setIntent(selection);
  if (selection === "bring-team") {
    router.push("/onboarding/team");
    return;
  }
  if (selection === "join-team" && !acceptedOrganization) {
    setShowInviteRecovery(true);
    return;
  }
  router.push("/onboarding/personal/settings");
}

function continueWithoutAcceptedTeam(): void {
  setIntent("join-team");
  router.push("/onboarding/personal/settings");
}
```

Delete `PlanType`, plan ordering, plan badges, prices, `PlanIcon`, membership effects, `resetOnboardingPreservingPlan`, and every route to `/onboarding/teams/details` or `/onboarding/organization/details`.

- [ ] **Step 4: Add exact Convenio translations**

Add:

```json
"onboarding_intent_title": "How will you schedule?",
"onboarding_intent_description": "Choose the setup that matches the work in front of you.",
"onboarding_intent_solo": "I work on my own",
"onboarding_intent_solo_description": "Set your calendar, availability, and booking page.",
"onboarding_intent_join": "I am joining a team",
"onboarding_intent_join_description": "Carry your availability into a team that already exists.",
"onboarding_intent_bring": "I am bringing a team",
"onboarding_intent_bring_description": "Create the place where your team’s calendars can agree.",
"onboarding_join_context_title": "You’re joining {{teamName}}.",
"onboarding_join_context_description": "Set your calendar first. The team is already connected to your account.",
"onboarding_invite_recovery_title": "Your invitation opens the team.",
"onboarding_invite_recovery_description": "Use the invitation link in your email. Until it is accepted, Convenio cannot place you in that team.",
"onboarding_continue_solo": "Continue on my own",
"onboarding_choose_another_setup": "Choose another setup"
```

The “Choose another setup” action returns to the radio choices without changing persisted intent.

- [ ] **Step 5: Run Task 2 verification**

Run:

```bash
yarn biome check --write apps/web/modules/onboarding/getting-started/onboarding-view.tsx apps/web/modules/onboarding/getting-started/onboarding-view.test.tsx packages/i18n/locales/en/common.json
TZ=UTC yarn test apps/web/modules/onboarding/getting-started/onboarding-view.test.tsx
```

Expected: Biome clean; 5 intent tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/web/modules/onboarding/getting-started/onboarding-view.tsx apps/web/modules/onboarding/getting-started/onboarding-view.test.tsx packages/i18n/locales/en/common.json
git commit -m "feat(onboarding): ask for scheduling intent"
```

---

### Task 3: Create a Team Through the Existing Clerk Command

**Files:**
- Create: `apps/web/app/(use-page-wrapper)/onboarding/team/page.tsx`
- Create: `apps/web/modules/onboarding/team/bring-team-view.tsx`
- Create: `apps/web/modules/onboarding/team/bring-team-view.test.tsx`
- Modify: `apps/web/modules/organizations/CreateOrganization.tsx`
- Modify: `apps/web/modules/organizations/CreateOrganization.test.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: `CreateOrganizationForm`, `trpc.viewer.organizations.create`, and `setCreatedOrganization` from Task 1.
- Produces: a reconciled `CreatedOrganizationContext` persisted before navigation to `/onboarding/personal/settings`.
- Boundary: renders no invitation list, invitation count, invite link, or members-route link.

- [ ] **Step 1: Write failing form-label and bring-team tests**

Extend `CreateOrganization.test.tsx`:

```tsx
it("accepts onboarding-specific submit copy", () => {
  render(<CreateOrganizationForm isPending={false} onSubmit={vi.fn()} submitLabel="Create team and continue ›" />);
  expect(screen.getByRole("button", { name: "Create team and continue ›" })).toBeVisible();
});
```

Create `bring-team-view.test.tsx`:

```tsx
it("stores the reconciled organization before continuing personal setup", async () => {
  render(<BringTeamView userEmail="owner@example.com" />);
  await userEvent.type(screen.getByLabelText("Organization name"), "Operations");
  await userEvent.click(screen.getByRole("button", { name: "Create team and continue ›" }));

  expect(mocks.create).toHaveBeenCalledWith({ name: "Operations", slug: "operations" });
  mocks.onSuccess?.({ acceptedSeats: 1, archived: false, organizationId: 41 });
  expect(mocks.setCreatedOrganization).toHaveBeenCalledWith({
    id: 41,
    name: "Operations",
    slug: "operations",
  });
  expect(mocks.setCreatedOrganization.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.push.mock.invocationCallOrder[0]
  );
  expect(mocks.push).toHaveBeenCalledWith("/onboarding/personal/settings");
});

it("stays on the form when Clerk creation fails", () => {
  render(<BringTeamView userEmail="owner@example.com" />);
  mocks.onError?.({ message: "Clerk organization operation failed" });
  expect(mocks.showToast).toHaveBeenCalledWith("The team could not be created. Try again.", "error");
  expect(mocks.push).not.toHaveBeenCalled();
});

it("does not claim that invitations are available in this slice", () => {
  render(<BringTeamView userEmail="owner@example.com" />);
  expect(screen.getByText("Only you are added now. Invitations follow after setup.")).toBeVisible();
  expect(screen.queryByText(/pending invitation/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /members/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run Task 3 tests and verify failure**

Run:

```bash
TZ=UTC yarn test apps/web/modules/organizations/CreateOrganization.test.tsx apps/web/modules/onboarding/team/bring-team-view.test.tsx
```

Expected: FAIL because `submitLabel` and `BringTeamView` do not exist.

- [ ] **Step 3: Make the shared organization form copy-configurable**

Extend only the form prop:

```ts
type CreateOrganizationFormProps = {
  isPending: boolean;
  onSubmit(input: OrganizationInput): void;
  submitLabel?: string;
};
```

Use the provided label without changing settings behavior:

```tsx
function CreateOrganizationForm({ isPending, onSubmit, submitLabel }: CreateOrganizationFormProps) {
  const { t } = useLocale();
  const actionLabel = submitLabel ?? t("organization_bootstrap_create");
  return <Button loading={isPending} type="submit">{actionLabel}</Button>;
}
```

Retain the existing slug normalization, field labels, validation, and default settings CTA.

- [ ] **Step 4: Add the authenticated onboarding team route**

Create `onboarding/team/page.tsx`:

```tsx
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { BringTeamView } from "~/onboarding/team/bring-team-view";

export default async function BringTeamPage() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect("/auth/login");
  return <BringTeamView userEmail={session.user.email ?? ""} />;
}
```

- [ ] **Step 5: Implement the Clerk-backed bring-team view**

Create `bring-team-view.tsx`. Reuse `CreateOrganizationForm`; do not duplicate slug logic:

```tsx
"use client";

export function BringTeamView({ userEmail }: { userEmail: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const { setCreatedOrganization } = useOnboardingStore();
  const submitted = useRef<{ name: string; slug: string } | null>(null);
  const create = trpc.viewer.organizations.create.useMutation({
    onError: () => showToast(t("onboarding_team_create_error"), "error"),
    onSuccess: ({ organizationId }) => {
      if (!submitted.current) return;
      setCreatedOrganization({
        id: organizationId,
        name: submitted.current.name,
        slug: submitted.current.slug,
      });
      router.push("/onboarding/personal/settings");
    },
  });

  return (
    <OnboardingLayout currentStep={1} totalSteps={4} userEmail={userEmail}>
      <OnboardingCard
        title={t("onboarding_team_create_title")}
        subtitle={t("onboarding_team_create_description")}
        footer={null}>
        <p className="text-subtle text-sm">{t("onboarding_team_create_boundary")}</p>
        <CreateOrganizationForm
          isPending={create.isPending}
          onSubmit={(input) => {
            submitted.current = input;
            create.mutate(input);
          }}
          submitLabel={t("onboarding_team_create_action")}
        />
      </OnboardingCard>
    </OnboardingLayout>
  );
}
```

Keep only one meaningful content plane; do not add a decorative invitation card.

- [ ] **Step 6: Add exact bring-team translations**

```json
"onboarding_team_create_title": "Name the team.",
"onboarding_team_create_description": "Create the organization that will hold the shared calendar.",
"onboarding_team_create_boundary": "Only you are added now. Invitations follow after setup.",
"onboarding_team_create_action": "Create team and continue ›",
"onboarding_team_create_error": "The team could not be created. Try again."
```

- [ ] **Step 7: Run Task 3 verification**

Run:

```bash
yarn biome check --write 'apps/web/app/(use-page-wrapper)/onboarding/team/page.tsx' apps/web/modules/onboarding/team/bring-team-view.tsx apps/web/modules/onboarding/team/bring-team-view.test.tsx apps/web/modules/organizations/CreateOrganization.tsx apps/web/modules/organizations/CreateOrganization.test.tsx packages/i18n/locales/en/common.json
TZ=UTC yarn test apps/web/modules/organizations/CreateOrganization.test.tsx apps/web/modules/onboarding/team/bring-team-view.test.tsx
```

Expected: Biome clean; shared form and bring-team tests PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add 'apps/web/app/(use-page-wrapper)/onboarding/team/page.tsx' apps/web/modules/onboarding/team/bring-team-view.tsx apps/web/modules/onboarding/team/bring-team-view.test.tsx apps/web/modules/organizations/CreateOrganization.tsx apps/web/modules/organizations/CreateOrganization.test.tsx packages/i18n/locales/en/common.json
git commit -m "feat(onboarding): create teams through Clerk"
```

---

### Task 4: Add a Skippable, Team-Aware Completion Decision

**Files:**
- Create: `apps/web/app/(use-page-wrapper)/onboarding/complete/page.tsx`
- Create: `apps/web/modules/onboarding/complete/completion-view.tsx`
- Create: `apps/web/modules/onboarding/complete/completion-view.test.tsx`
- Modify: `apps/web/modules/onboarding/personal/calendar/personal-calendar-view.tsx`
- Modify: `apps/web/modules/onboarding/hooks/useSubmitPersonalOnboarding.ts`
- Create: `apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: `AcceptedOrganizationContext[]`, hydrated `intent` and `createdOrganization`, `PlanSelector`, and `usePaidPlanCheckout`.
- Produces:

```ts
type SubmitPersonalOnboardingOptions = {
  afterComplete?: () => void;
};

submitPersonalOnboarding(options?: SubmitPersonalOnboardingOptions): Promise<void>;
```

- The completion screen offers Pro for solo/missing-join recovery, Team for bring-team and accepted owner/admin joiners, no unauthorized checkout for ordinary members, and `Keep working free` in every hydrated state.

- [ ] **Step 1: Write failing completion-sequencing hook tests**

Create `useSubmitPersonalOnboarding.test.ts`. Mock the profile mutation, event-type query/create mutation, viewer refetch, router, storage, and welcome flag:

```ts
it("runs the paid continuation only after profile completion and default setup", async () => {
  const afterComplete = vi.fn();
  mocks.eventTypes = [];
  const { result } = renderHook(() => useSubmitPersonalOnboarding());

  await act(() => result.current.submitPersonalOnboarding({ afterComplete }));

  expect(mocks.updateProfile).toHaveBeenCalledWith({ completedOnboarding: true });
  expect(mocks.createEventType).toHaveBeenCalledTimes(3);
  expect(mocks.refetch).toHaveBeenCalled();
  expect(afterComplete).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.refetch.mock.invocationCallOrder[0]).toBeLessThan(
    afterComplete.mock.invocationCallOrder[0]
  );
});

it("does not leave onboarding when completion fails", async () => {
  mocks.updateProfile.mockRejectedValue(new Error("failed"));
  const afterComplete = vi.fn();
  const { result } = renderHook(() => useSubmitPersonalOnboarding());

  await act(() => result.current.submitPersonalOnboarding({ afterComplete }));

  expect(afterComplete).not.toHaveBeenCalled();
  expect(mocks.showToast).toHaveBeenCalledWith("Something went wrong", "error");
});
```

- [ ] **Step 2: Run the hook test and verify failure**

Run:

```bash
TZ=UTC yarn test apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts
```

Expected: FAIL because submission is callback-only and does not accept `afterComplete`.

- [ ] **Step 3: Refactor completion into one awaitable sequence**

Keep the current default event definitions and redirects, but move the mutation work into the returned async function:

```ts
type SubmitPersonalOnboardingOptions = { afterComplete?: () => void };

const mutation = trpc.viewer.me.updateProfile.useMutation();

const submitPersonalOnboarding = async (
  options: SubmitPersonalOnboardingOptions = {}
): Promise<void> => {
  try {
    await mutation.mutateAsync({ completedOnboarding: true });
    if (eventTypes?.length === 0) {
      await Promise.all(
        DEFAULT_EVENT_TYPES.map((event) =>
          createEventType.mutateAsync({
            hidden: event.hidden,
            length: event.length,
            slug: event.slug,
            title: t(event.title),
          })
        )
      );
    }
    await utils.viewer.me.get.refetch();
    if (options.afterComplete) {
      options.afterComplete();
      return;
    }
    const redirectUrl = localStorage.getItem(ONBOARDING_REDIRECT_KEY);
    if (redirectUrl) {
      localStorage.removeItem(ONBOARDING_REDIRECT_KEY);
      router.push(redirectUrl);
      return;
    }
    const hasOrgModalFlag = sessionStorage.getItem(ORG_MODAL_STORAGE_KEY) === "true";
    if (!hasOrgModalFlag) {
      setShowWelcomeToCalcomModalFlag();
      router.push("/event-types?welcomeToCalcomModal=true");
      return;
    }
    router.push("/event-types?newOrganizationModal=true");
  } catch (error) {
    showToast(t("something_went_wrong"), "error");
    console.error(error);
  }
};
```

Expose `isSubmitting` as the OR of profile mutation and default-event mutation pending states.

- [ ] **Step 4: Write failing completion-view tests**

Create `completion-view.test.tsx` with mocked hydrated store, checkout hook, completion hook, and PlanSelector:

```tsx
it("always completes through Keep working free", async () => {
  mocks.intent = "solo";
  render(<CompletionView acceptedOrganizations={[]} userEmail="ada@example.com" />);
  await userEvent.click(screen.getByRole("button", { name: "Keep working free" }));
  expect(mocks.submitPersonalOnboarding).toHaveBeenCalledWith();
});

it("completes before starting personal Pro checkout", async () => {
  mocks.intent = "solo";
  mocks.submitPersonalOnboarding.mockImplementation(async ({ afterComplete }) => afterComplete());
  render(<CompletionView acceptedOrganizations={[]} userEmail="ada@example.com" />);
  await userEvent.click(screen.getByRole("button", { name: "Choose Pro ›" }));
  expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "PRO" });
});

it("binds bring-team checkout to the reconciled organization", async () => {
  mocks.intent = "bring-team";
  mocks.createdOrganization = { id: 41, name: "Operations", slug: "operations" };
  mocks.submitPersonalOnboarding.mockImplementation(async ({ afterComplete }) => afterComplete());
  render(<CompletionView acceptedOrganizations={[]} userEmail="owner@example.com" />);
  await userEvent.click(screen.getByRole("button", { name: "Bring in the team ›" }));
  expect(mocks.startCheckout).toHaveBeenCalledWith({ interval: "YEAR", plan: "TEAM" }, 41);
});

it("does not offer billing management to an ordinary accepted member", () => {
  mocks.intent = "join-team";
  render(
    <CompletionView
      acceptedOrganizations={[{ id: 41, name: "Operations", role: "MEMBER", slug: "operations" }]}
      userEmail="member@example.com"
    />
  );
  expect(screen.getByText("Operations manages the Team plan.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Bring in the team ›" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Keep working free" })).toBeVisible();
});

it("recovers when bring-team state has no organization subject", () => {
  mocks.intent = "bring-team";
  mocks.createdOrganization = null;
  render(<CompletionView acceptedOrganizations={[]} userEmail="owner@example.com" />);
  expect(screen.getByRole("link", { name: "Create the team" })).toHaveAttribute(
    "href",
    "/onboarding/team"
  );
  expect(screen.queryByRole("button", { name: "Bring in the team ›" })).not.toBeInTheDocument();
});
```

Add a hydration case that sets `useOnboardingStore.persist.hasHydrated()` to false and expects a status-labelled skeleton rather than a plan card.

- [ ] **Step 5: Route calendar completion to the recap**

In `personal-calendar-view.tsx`, remove `useSubmitPersonalOnboarding` and route both actions:

```ts
const handleContinue = () => router.push("/onboarding/complete");
const handleSkip = () => router.push("/onboarding/complete");
```

Retain calendar installation behavior, loading guards, Back, and existing button labels.

- [ ] **Step 6: Add the authenticated completion route**

Create `onboarding/complete/page.tsx`:

```tsx
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { CompletionView } from "~/onboarding/complete/completion-view";
import { getAcceptedOrganizationContexts } from "~/onboarding/lib/getAcceptedOrganizationContexts";

export default async function OnboardingCompletePage() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect("/auth/login");
  const acceptedOrganizations = await getAcceptedOrganizationContexts({
    preferredOrganizationId: session.user.org?.id,
    userId: session.user.id,
  });
  return (
    <CompletionView
      acceptedOrganizations={acceptedOrganizations}
      userEmail={session.user.email ?? ""}
    />
  );
}
```

- [ ] **Step 7: Implement hydrated, team-aware completion**

In `completion-view.tsx`, subscribe to Zustand hydration before branching:

```ts
const [hydrated, setHydrated] = useState(useOnboardingStore.persist.hasHydrated());
useEffect(() => useOnboardingStore.persist.onFinishHydration(() => setHydrated(true)), []);
```

Resolve the accepted organization and paid plan:

```ts
const acceptedOrganization = acceptedOrganizations[0] ?? null;
const checkoutOrganization =
  intent === "bring-team"
    ? createdOrganization
    : intent === "join-team"
      ? acceptedOrganization
      : null;
const canManageTeam =
  checkoutOrganization &&
  ("role" in checkoutOrganization
    ? checkoutOrganization.role === "OWNER" || checkoutOrganization.role === "ADMIN"
    : true);
const visiblePlan = intent === "bring-team" || (intent === "join-team" && acceptedOrganization)
  ? "TEAM"
  : "PRO";
```

Create one paid handler that completes first:

```ts
function selectPaidPlan(selection: PaidSelection): void {
  void submitPersonalOnboarding({
    afterComplete: () => {
      if (selection.plan === "TEAM" && checkoutOrganization) {
        paidCheckout.startCheckout(selection, checkoutOrganization.id);
        return;
      }
      paidCheckout.startCheckout(selection);
    },
  });
}
```

Render `PlanSelector` with `showAllPlans={false}`, the single appropriate `visiblePlans` entry, and CTA key `billing_choose_pro` or `billing_choose_team`. Render the free action outside the selector so it is never hidden in a sheet:

```tsx
<Button
  className="mt-4 w-full justify-center"
  color="secondary"
  disabled={isSubmitting}
  onClick={() => void submitPersonalOnboarding()}>
  {t("billing_keep_working_free")}
</Button>
```

For an accepted `MEMBER`, replace `PlanSelector` with the team-management sentence and keep the free button. For missing bring-team context, show a Button link to `/onboarding/team` and do not call Team checkout. For join-team without accepted context, show the invitation recovery sentence and the Pro treatment.

- [ ] **Step 8: Add exact completion translations**

```json
"onboarding_complete_solo_title": "Your calendar is ready.",
"onboarding_complete_solo_description": "Choose how much of the work Convenio should carry now.",
"onboarding_complete_join_title": "Your calendar is ready for {{teamName}}.",
"onboarding_complete_join_description": "The team keeps the shared scheduling record.",
"onboarding_complete_join_missing_title": "Your calendar is ready.",
"onboarding_complete_join_missing_description": "Your invitation link is still the way into the team.",
"onboarding_complete_bring_title": "{{teamName}} is in place.",
"onboarding_complete_bring_description": "Choose Team when the calendars need one shared record.",
"onboarding_complete_member_plan": "{{teamName}} manages the Team plan.",
"onboarding_complete_create_team": "Create the team",
"onboarding_complete_loading": "Loading your setup"
```

- [ ] **Step 9: Run Task 4 verification**

Run:

```bash
yarn biome check --write 'apps/web/app/(use-page-wrapper)/onboarding/complete/page.tsx' apps/web/modules/onboarding/complete/completion-view.tsx apps/web/modules/onboarding/complete/completion-view.test.tsx apps/web/modules/onboarding/personal/calendar/personal-calendar-view.tsx apps/web/modules/onboarding/hooks/useSubmitPersonalOnboarding.ts apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts packages/i18n/locales/en/common.json
TZ=UTC yarn test apps/web/modules/onboarding/complete/completion-view.test.tsx apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts
```

Expected: Biome clean; completion sequencing, free path, organization subject, member permission, recovery, and hydration tests PASS.

- [ ] **Step 10: Commit Task 4**

```bash
git add 'apps/web/app/(use-page-wrapper)/onboarding/complete/page.tsx' apps/web/modules/onboarding/complete/completion-view.tsx apps/web/modules/onboarding/complete/completion-view.test.tsx apps/web/modules/onboarding/personal/calendar/personal-calendar-view.tsx apps/web/modules/onboarding/hooks/useSubmitPersonalOnboarding.ts apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts packages/i18n/locales/en/common.json
git commit -m "feat(onboarding): finish with a plan decision"
```

---

### Task 5: Verify the Free Onboarding Journey End to End

**Files:**
- Modify: `apps/web/playwright/onboarding.e2e.ts`

**Interfaces:**
- Consumes: the exact intent labels from Task 2 and completion free action from Task 4.
- Produces: browser evidence that all existing identity-provider variants traverse the new first and final steps and persist `completedOnboarding=true`.

- [ ] **Step 1: Update the Playwright journey**

Replace the old “Plan Selection” click with an explicit solo selection:

```ts
await test.step("step 1 - Setup intent", async () => {
  await page.getByRole("radio", { name: "I work on my own" }).click();
  await page.getByTestId("onboarding-continue-btn").click();
  await page.waitForURL(/.*\/onboarding\/personal\/settings/);
});
```

Change the calendar expectation to the completion route and add the final step:

```ts
await test.step("step 3 - Calendar connection", async () => {
  await page.getByTestId("onboarding-continue-btn").click();
  await page.waitForURL(/.*\/onboarding\/complete/);
});

await test.step("step 4 - Keep working free", async () => {
  await page.getByRole("button", { name: "Keep working free" }).click();
  await page.waitForURL("/event-types**");
  const userComplete = await user.self();
  expect(userComplete.completedOnboarding).toBe(true);
});
```

Keep the existing Google, CAL, SAML, and Azure AD matrix. Do not add Clerk create/invite E2E here because that requires external Clerk state and belongs to the later invitations/seat slice.

- [ ] **Step 2: Run focused unit regression first**

Run:

```bash
TZ=UTC yarn test apps/web/modules/onboarding/store/onboarding-store.test.ts apps/web/modules/onboarding/lib/getAcceptedOrganizationContexts.test.ts apps/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded.test.ts apps/web/modules/onboarding/getting-started/onboarding-view.test.tsx apps/web/modules/onboarding/team/bring-team-view.test.tsx apps/web/modules/onboarding/complete/completion-view.test.tsx apps/web/modules/onboarding/hooks/__tests__/useSubmitPersonalOnboarding.test.ts packages/features/auth/lib/onboardingUtils.test.ts
```

Expected: all onboarding unit tests PASS.

- [ ] **Step 3: Run the Playwright journey against an available web server**

Run:

```bash
NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000 yarn playwright test apps/web/playwright/onboarding.e2e.ts --project=@calcom/web --workers=1
```

Expected: all four identity-provider onboarding journeys PASS. If the configured Playwright server requires a production build, stop and request the repository-required approval before running a full build; do not replace this with an unverified success claim.

- [ ] **Step 4: Run final formatting and type verification**

Run:

```bash
yarn biome check --write apps/web/playwright/onboarding.e2e.ts
yarn type-check:ci --force
```

Expected: Biome clean; all Turbo type-check tasks PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/web/playwright/onboarding.e2e.ts
git commit -m "test(onboarding): cover the free completion path"
```

## Final Review Gate

- Confirm the complete diff remains a sequence of five reviewable commits and no implementation commit exceeds 500 changed code lines or 10 code files.
- Confirm no code reads `selectedPlan` to decide the new intent flow.
- Confirm the membership helper filters `accepted: true`, `archivedAt: null`, and `isOrganization: true` with an explicit `select`.
- Confirm no screen says or implies that a pending invitation was discovered from Prisma.
- Confirm bring-team calls `viewer.organizations.create` and does not render an invitation panel or members link.
- Confirm `Keep working free` is outside `PlanSelector`, visible in every completion variant, and completes onboarding without checkout.
- Confirm paid checkout is invoked only from `afterComplete`, and Team checkout always has a positive organization ID.
- Confirm ordinary members never receive a Team billing-management action.
- Confirm hydration is resolved before completion branches on persisted intent.
- Confirm no onboarding capability was added to `upgradeIntent.ts`.
- Run the focused unit suite, Playwright when infrastructure permits, Biome, and `yarn type-check:ci --force` before claiming completion.
