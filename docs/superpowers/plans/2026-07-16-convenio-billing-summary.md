# Convenio Billing Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Polar-backed billing summary to the authenticated Convenio shell, including effective plan, accepted Team seat usage, and permission-correct plan actions.

**Architecture:** A no-input `viewer.billing.summary` query chooses the billing subject from the authenticated user's active profile, verifies accepted organization membership server-side, and falls back to the personal subject when that profile context is absent or stale. The handler composes the existing Polar subscription projection with the canonical `getEntitlements` evaluator, while a compact client widget renders the read model in the authenticated shell without exposing provider identifiers or blocking page content.

**Tech Stack:** TypeScript, Prisma `select`, tRPC, React, TanStack Query through tRPC, Vitest, Testing Library, Cal.com UI components, next-i18next translations.

## Global Constraints

- An accepted organization member is one billed Polar seat; pending memberships never count.
- The current Team entitlement limit is exactly 50 accepted members and must come from `getEntitlements(...).limits.acceptedOrganizationMembers`, never from a new literal in application code.
- Effective plan and paid-access grace behavior must come from `getEntitlements`; do not infer access from raw `BillingSubscription.plan` or duplicate status logic.
- The summary query accepts no organization identifier from the client; it uses the active profile organization and verifies accepted membership before returning organization data.
- Ordinary accepted organization members may read the non-sensitive organization summary; only accepted `OWNER` and `ADMIN` roles receive management affordances or billed quantity.
- Never return `polarCustomerId`, `polarSubscriptionId`, `polarProductId`, Clerk identifiers, email addresses, credentials, or `credential.key`.
- The widget shows accepted seat usage as `{{used}} of {{limit}} seats in use`; it never renders billed quantity.
- Personal users may manage their own plan. Organization plan links appear only for accepted owners/admins.
- Loading and failure states never block or replace authenticated page content.
- New UI strings live in `packages/i18n/locales/en/common.json` and use Convenio's short, declarative voice.
- Use direct source imports, `import type` for types, Prisma `select` rather than `include`, Biome formatting, and no new dependencies.
- Keep each stacked task below 500 changed lines and at or below 10 code files.

## File Map

- `packages/trpc/server/routers/viewer/billing/billing.handler.ts` — owns the safe summary read repository, active-subject selection, entitlement composition, and output sanitization.
- `packages/trpc/server/routers/viewer/billing/billing.handler.test.ts` — proves personal and organization summaries, role filtering, stale-context fallback, effective-plan handling, and absence of provider identifiers.
- `packages/trpc/server/routers/viewer/billing/_router.ts` — exposes the authenticated no-input `summary` query.
- `apps/web/modules/billing/BillingStatusWidget.tsx` — renders the compact plan card, seat usage, permission-correct links, skeleton, and retry state.
- `apps/web/modules/billing/BillingStatusWidget.test.tsx` — covers every widget state and link rule without provider data.
- `packages/i18n/locales/en/common.json` — contains the Convenio-specific status-widget copy.
- `apps/web/modules/shell/Shell.tsx` — mounts the widget once in authenticated main content and never in `PublicShell` or `Dock`.
- `apps/web/modules/shell/Shell.test.tsx` — proves authenticated-only mounting and guards against duplicate/public mounts.

---

### Task A: Safe Billing Summary Read Model

**Files:**
- Modify: `packages/trpc/server/routers/viewer/billing/billing.handler.ts:1-162`
- Modify: `packages/trpc/server/routers/viewer/billing/billing.handler.test.ts:1-112`
- Modify: `packages/trpc/server/routers/viewer/billing/_router.ts:1-32`

**Interfaces:**
- Consumes: `getEntitlements(subscription: SubscriptionEntitlementInput | null, now?: Date): EntitlementSnapshot` from `@calcom/features/billing/lib/entitlements`; the existing sanitized `BillingProjection`; authenticated `ctx.user.id` and `ctx.user.profile?.organizationId`.
- Produces: `summaryBillingHandler(options): Promise<BillingSummary>` and `viewer.billing.summary`, where `BillingSummary` is exactly:

```ts
type BillingSummary = {
  canManageBilling: boolean;
  plan: PlanKey;
  seats: {
    accepted: number;
    billed: number | null;
    limit: number;
  } | null;
  status: BillingStatus;
  subject:
    | { id: number; type: "USER" }
    | { id: number; type: "ORGANIZATION" };
};
```

- [ ] **Step 1: Extend the handler test fixture and write failing personal-summary tests**

In `billing.handler.test.ts`, import `summaryBillingHandler`, give the test context an active-profile slot, and add summary repository mocks:

```ts
import {
  type BillingHandlerDependencies,
  cancelAtPeriodEndHandler,
  changePlanHandler,
  createCheckoutHandler,
  createPortalSessionHandler,
  getBillingHandler,
  reconcileBillingHandler,
  summaryBillingHandler,
} from "./billing.handler";

function setup() {
  const commands = {
    cancelAtPeriodEnd: vi.fn().mockResolvedValue(undefined),
    changePlan: vi.fn().mockResolvedValue(undefined),
    createCheckout: vi.fn().mockResolvedValue({ checkoutUrl: "https://sandbox.polar.sh/checkout/one" }),
    createPortalSession: vi
      .fn()
      .mockResolvedValue({ portalUrl: "https://sandbox.polar.sh/purchases/session" }),
    reconcile: vi.fn().mockResolvedValue(undefined),
  };
  const read = {
    getOrganizationProjection: vi.fn().mockResolvedValue({ subscription: null }),
    getOrganizationSummary: vi.fn().mockResolvedValue(null),
    getUserProjection: vi.fn().mockResolvedValue(null),
  };
  const rateLimit = vi.fn().mockResolvedValue(undefined);
  const dependencies: BillingHandlerDependencies = { commands, rateLimit, read };
  return { commands, dependencies, rateLimit, read };
}

const ctx = { user: { id: 7, profile: { organizationId: null } } };

describe("billing summary", () => {
  it("returns the personal Free summary without a projection", async () => {
    const test = setup();

    await expect(summaryBillingHandler({ ctx, dependencies: test.dependencies })).resolves.toEqual({
      canManageBilling: true,
      plan: "FREE",
      seats: null,
      status: "NONE",
      subject: { id: 7, type: "USER" },
    });
  });

  it("uses the effective personal plan from the Polar-backed projection", async () => {
    const test = setup();
    test.read.getUserProjection.mockResolvedValue({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
      interval: "MONTH",
      plan: "PRO",
      seatCount: 1,
      status: "ACTIVE",
    });

    await expect(summaryBillingHandler({ ctx, dependencies: test.dependencies })).resolves.toMatchObject({
      canManageBilling: true,
      plan: "PRO",
      seats: null,
      status: "ACTIVE",
      subject: { id: 7, type: "USER" },
    });
  });
});
```

- [ ] **Step 2: Run the focused handler tests to verify RED**

Run:

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/billing/billing.handler.test.ts
```

Expected: FAIL because `summaryBillingHandler` is not exported and `getOrganizationSummary` is not part of `BillingReadRepository`.

- [ ] **Step 3: Add failing organization, role, fallback, and sanitization tests**

Append these tests inside `describe("billing summary", ...)`:

```ts
it("shows accepted Team usage to an ordinary member without management data", async () => {
  const test = setup();
  test.read.getOrganizationSummary.mockResolvedValue({
    acceptedSeats: 4,
    actorRole: "MEMBER",
    organizationId: 41,
    subscription: {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
      interval: "MONTH",
      plan: "TEAM",
      seatCount: 4,
      status: "ACTIVE",
    },
  });

  const result = await summaryBillingHandler({
    ctx: { user: { id: 7, profile: { organizationId: 41 } } },
    dependencies: test.dependencies,
  });

  expect(result).toEqual({
    canManageBilling: false,
    plan: "TEAM",
    seats: { accepted: 4, billed: null, limit: 50 },
    status: "ACTIVE",
    subject: { id: 41, type: "ORGANIZATION" },
  });
  expect(JSON.stringify(result)).not.toMatch(/polar|provider|customer|subscriptionId|productId|credential/i);
});

it.each(["OWNER", "ADMIN"] as const)("allows an accepted %s to manage the plan", async (actorRole) => {
  const test = setup();
  test.read.getOrganizationSummary.mockResolvedValue({
    acceptedSeats: 4,
    actorRole,
    organizationId: 41,
    subscription: {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-15T12:00:00.000Z"),
      interval: "YEAR",
      plan: "TEAM",
      seatCount: 5,
      status: "ACTIVE",
    },
  });

  await expect(
    summaryBillingHandler({
      ctx: { user: { id: 7, profile: { organizationId: 41 } } },
      dependencies: test.dependencies,
    })
  ).resolves.toMatchObject({
    canManageBilling: true,
    seats: { accepted: 4, billed: 5, limit: 50 },
  });
});

it("falls back to the personal subject when the active organization is stale or unaccepted", async () => {
  const test = setup();
  test.read.getOrganizationSummary.mockResolvedValue(null);

  await expect(
    summaryBillingHandler({
      ctx: { user: { id: 7, profile: { organizationId: 41 } } },
      dependencies: test.dependencies,
    })
  ).resolves.toMatchObject({
    canManageBilling: true,
    plan: "FREE",
    subject: { id: 7, type: "USER" },
  });
  expect(test.read.getOrganizationSummary).toHaveBeenCalledWith({
    actorUserId: 7,
    organizationId: 41,
  });
  expect(test.read.getUserProjection).toHaveBeenCalledWith(7);
});

it("uses entitlement expiry rules instead of the raw Team plan", async () => {
  const test = setup();
  test.read.getOrganizationSummary.mockResolvedValue({
    acceptedSeats: 4,
    actorRole: "OWNER",
    organizationId: 41,
    subscription: {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2020-01-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2019-12-01T00:00:00.000Z"),
      interval: "MONTH",
      plan: "TEAM",
      seatCount: 4,
      status: "CANCELED",
    },
  });

  await expect(
    summaryBillingHandler({
      ctx: { user: { id: 7, profile: { organizationId: 41 } } },
      dependencies: test.dependencies,
    })
  ).resolves.toEqual({
    canManageBilling: true,
    plan: "FREE",
    seats: null,
    status: "CANCELED",
    subject: { id: 41, type: "ORGANIZATION" },
  });
});
```

These tests make rejected, pending, archived, or missing organizations follow the same repository `null` path; the Prisma predicate added below is what guarantees those states cannot produce an organization summary.

- [ ] **Step 4: Implement the minimal repository and summary handler**

In `billing.handler.ts`, add the canonical evaluator and role type imports:

```ts
import { getEntitlements } from "@calcom/features/billing/lib/entitlements";
import type { BillingInterval, BillingStatus, MembershipRole, PlanKey } from "@calcom/prisma/enums";
```

Add these types beside `BillingProjection`, and extend the existing context/repository types exactly as shown:

```ts
type OrganizationBillingSummaryState = {
  acceptedSeats: number;
  actorRole: MembershipRole;
  organizationId: number;
  subscription: BillingProjection | null;
};

type BillingSummary = {
  canManageBilling: boolean;
  plan: PlanKey;
  seats: { accepted: number; billed: number | null; limit: number } | null;
  status: BillingStatus;
  subject:
    | { id: number; type: "USER" }
    | { id: number; type: "ORGANIZATION" };
};

type BillingContext = {
  user: {
    id: number;
    profile?: { organizationId: number | null } | null;
  };
};

type BillingReadRepository = {
  getOrganizationProjection(input: {
    actorUserId: number;
    organizationId: number;
  }): Promise<{ subscription: BillingProjection | null } | null>;
  getOrganizationSummary(input: {
    actorUserId: number;
    organizationId: number;
  }): Promise<OrganizationBillingSummaryState | null>;
  getUserProjection(userId: number): Promise<BillingProjection | null>;
};
```

Add the repository method to `PrismaBillingReadRepository`. The nested membership selection and filtered count must remain in this one query; do not widen `billingProjectionSelect` with provider fields:

```ts
async getOrganizationSummary(input: {
  actorUserId: number;
  organizationId: number;
}): Promise<OrganizationBillingSummaryState | null> {
  const organization = await prisma.team.findFirst({
    where: {
      archivedAt: null,
      id: input.organizationId,
      isOrganization: true,
      members: { some: { accepted: true, userId: input.actorUserId } },
    },
    select: {
      _count: { select: { members: { where: { accepted: true } } } },
      billingSubscription: { select: billingProjectionSelect },
      id: true,
      members: {
        where: { accepted: true, userId: input.actorUserId },
        take: 1,
        select: { role: true },
      },
    },
  });
  const actor = organization?.members[0];
  if (!organization || !actor) return null;
  return {
    acceptedSeats: organization._count.members,
    actorRole: actor.role,
    organizationId: organization.id,
    subscription: organization.billingSubscription,
  };
}
```

Add the handler before `createCheckoutHandler`:

```ts
async function summaryBillingHandler({
  ctx,
  dependencies = getDefaultDependencies(),
}: {
  ctx: BillingContext;
  dependencies?: BillingHandlerDependencies;
}): Promise<BillingSummary> {
  const organizationId = ctx.user.profile?.organizationId ?? null;
  if (organizationId !== null) {
    const organization = await dependencies.read.getOrganizationSummary({
      actorUserId: ctx.user.id,
      organizationId,
    });
    if (organization) {
      const entitlements = getEntitlements(organization.subscription);
      const canManageBilling = organization.actorRole === "OWNER" || organization.actorRole === "ADMIN";
      return {
        canManageBilling,
        plan: entitlements.effectivePlan,
        seats:
          entitlements.effectivePlan === "TEAM"
            ? {
                accepted: organization.acceptedSeats,
                billed: canManageBilling ? (organization.subscription?.seatCount ?? null) : null,
                limit: entitlements.limits.acceptedOrganizationMembers,
              }
            : null,
        status: entitlements.subscriptionStatus,
        subject: { id: organization.organizationId, type: "ORGANIZATION" },
      };
    }
  }

  const subscription = await dependencies.read.getUserProjection(ctx.user.id);
  const entitlements = getEntitlements(subscription);
  return {
    canManageBilling: true,
    plan: entitlements.effectivePlan,
    seats: null,
    status: entitlements.subscriptionStatus,
    subject: { id: ctx.user.id, type: "USER" },
  };
}
```

Export `summaryBillingHandler` with the other handlers and export the output type for focused tests and future server consumers:

```ts
export {
  cancelAtPeriodEndHandler,
  changePlanHandler,
  createCheckoutHandler,
  createPortalSessionHandler,
  getBillingHandler,
  reconcileBillingHandler,
  summaryBillingHandler,
};
export type { BillingHandlerDependencies, BillingSummary };
```

- [ ] **Step 5: Expose the authenticated no-input tRPC query**

In `_router.ts`, add this procedure without an `.input(...)` call:

```ts
summary: authedProcedure.query(async ({ ctx }) => {
  const { summaryBillingHandler } = await import("./billing.handler");
  return summaryBillingHandler({ ctx });
}),
```

This is intentionally distinct from the manager-only `billing.get` query. Do not broaden `billing.get` or accept `{ organizationId }` on `summary`.

- [ ] **Step 6: Run RED-to-GREEN checks for Task A**

Run:

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/billing/billing.handler.test.ts
yarn biome check --write packages/trpc/server/routers/viewer/billing/billing.handler.ts packages/trpc/server/routers/viewer/billing/billing.handler.test.ts packages/trpc/server/routers/viewer/billing/_router.ts
TZ=UTC yarn test packages/trpc/server/routers/viewer/billing/billing.handler.test.ts
```

Expected: the first post-implementation test run passes all billing handler tests; Biome reports the three files clean or formats them; the final test run remains GREEN.

- [ ] **Step 7: Commit Task A**

```bash
git add packages/trpc/server/routers/viewer/billing/_router.ts packages/trpc/server/routers/viewer/billing/billing.handler.ts packages/trpc/server/routers/viewer/billing/billing.handler.test.ts
git commit -m "feat(billing): add safe plan summary"
```

Expected: one focused commit changing 3 code files and remaining below 500 changed lines.

---

### Task B: Convenio Billing Status Widget

**Files:**
- Create: `apps/web/modules/billing/BillingStatusWidget.tsx`
- Create: `apps/web/modules/billing/BillingStatusWidget.test.tsx`
- Modify: `packages/i18n/locales/en/common.json:1283-1400`

**Interfaces:**
- Consumes: `RouterOutputs["viewer"]["billing"]["summary"]` and `trpc.viewer.billing.summary.useQuery(undefined, options)` produced by Task A.
- Produces: `BillingStatusWidget(): JSX.Element`, a standalone compact card with no shell-placement assumptions.

- [ ] **Step 1: Write failing widget tests for loading and failure states**

Create `BillingStatusWidget.test.tsx` with this test harness:

```tsx
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: undefined as
    | {
        canManageBilling: boolean;
        plan: "FREE" | "PRO" | "TEAM";
        seats: { accepted: number; billed: number | null; limit: number } | null;
        status: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID";
        subject: { id: number; type: "USER" | "ORGANIZATION" };
      }
    | undefined,
  isError: false,
  isPending: true,
  refetch: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, number | string>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
  }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      billing: {
        summary: {
          useQuery: () => ({
            data: mocks.data,
            isError: mocks.isError,
            isPending: mocks.isPending,
            refetch: mocks.refetch,
          }),
        },
      },
    },
  },
}));

import { BillingStatusWidget } from "./BillingStatusWidget";

beforeEach(() => {
  mocks.data = undefined;
  mocks.isError = false;
  mocks.isPending = true;
  mocks.refetch.mockReset();
});

describe("BillingStatusWidget", () => {
  it("shows a quiet fixed-height skeleton while loading", () => {
    const view = render(<BillingStatusWidget />);

    expect(view.getByLabelText("billing_status_widget_loading")).toHaveClass("min-h-24");
    expect(view.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the page usable and retries without showing a billing action", () => {
    mocks.isPending = false;
    mocks.isError = true;
    const view = render(<BillingStatusWidget />);

    expect(view.getByText("billing_status_widget_unavailable")).toBeInTheDocument();
    expect(view.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "billing_status_widget_retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the widget tests to verify RED**

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/BillingStatusWidget.test.tsx
```

Expected: FAIL because `BillingStatusWidget.tsx` does not exist.

- [ ] **Step 3: Add failing permission, link, and accepted-seat tests**

Append these cases inside the existing `describe` block:

```tsx
it("links a personal Free user to plan comparison", () => {
  mocks.isPending = false;
  mocks.data = {
    canManageBilling: true,
    plan: "FREE",
    seats: null,
    status: "NONE",
    subject: { id: 7, type: "USER" },
  };
  const view = render(<BillingStatusWidget />);

  expect(view.getByText("billing_plan_free")).toBeInTheDocument();
  expect(view.getByRole("link", { name: "billing_compare_plans" })).toHaveAttribute("href", "/pricing");
});

it("shows accepted Team usage to a member without a management link or billed quantity", () => {
  mocks.isPending = false;
  mocks.data = {
    canManageBilling: false,
    plan: "TEAM",
    seats: { accepted: 4, billed: null, limit: 50 },
    status: "ACTIVE",
    subject: { id: 41, type: "ORGANIZATION" },
  };
  const view = render(<BillingStatusWidget />);

  expect(view.getByText("billing_status_widget_seats:4:50")).toBeInTheDocument();
  expect(view.queryByRole("link")).not.toBeInTheDocument();
  expect(view.queryByText(/billed/i)).not.toBeInTheDocument();
});

it("links a Team manager to organization billing", () => {
  mocks.isPending = false;
  mocks.data = {
    canManageBilling: true,
    plan: "TEAM",
    seats: { accepted: 4, billed: 5, limit: 50 },
    status: "ACTIVE",
    subject: { id: 41, type: "ORGANIZATION" },
  };
  const view = render(<BillingStatusWidget />);

  expect(view.getByRole("link", { name: "billing_manage_plan" })).toHaveAttribute(
    "href",
    "/settings/billing?organizationId=41"
  );
  expect(view.queryByText("5")).not.toBeInTheDocument();
});

it("links a Free organization manager to organization-aware pricing", () => {
  mocks.isPending = false;
  mocks.data = {
    canManageBilling: true,
    plan: "FREE",
    seats: null,
    status: "NONE",
    subject: { id: 41, type: "ORGANIZATION" },
  };
  const view = render(<BillingStatusWidget />);

  expect(view.getByRole("link", { name: "billing_compare_plans" })).toHaveAttribute(
    "href",
    "/pricing?organizationId=41"
  );
});

it("links a personal paid user to personal billing", () => {
  mocks.isPending = false;
  mocks.data = {
    canManageBilling: true,
    plan: "PRO",
    seats: null,
    status: "ACTIVE",
    subject: { id: 7, type: "USER" },
  };
  const view = render(<BillingStatusWidget />);

  expect(view.getByRole("link", { name: "billing_manage_plan" })).toHaveAttribute(
    "href",
    "/settings/billing"
  );
});
```

- [ ] **Step 4: Implement the widget with exact action rules**

Create `BillingStatusWidget.tsx`:

```tsx
"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";

function BillingStatusWidget() {
  const { t } = useLocale();
  const query = trpc.viewer.billing.summary.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });

  if (query.isPending) {
    return (
      <aside
        aria-label={t("billing_status_widget_loading")}
        className="border-subtle bg-subtle mt-6 min-h-24 animate-pulse rounded-xl border"
      />
    );
  }

  if (query.isError || !query.data) {
    return (
      <aside className="border-subtle bg-default mt-6 flex min-h-24 items-center justify-between gap-4 rounded-xl border p-4">
        <p className="text-subtle text-sm">{t("billing_status_widget_unavailable")}</p>
        <Button color="minimal" onClick={() => void query.refetch()} size="sm">
          {t("billing_status_widget_retry")}
        </Button>
      </aside>
    );
  }

  const { canManageBilling, plan, seats, subject } = query.data;
  const organizationQuery =
    subject.type === "ORGANIZATION" ? `?organizationId=${subject.id}` : "";
  const actionHref = plan === "FREE" ? `/pricing${organizationQuery}` : `/settings/billing${organizationQuery}`;

  return (
    <aside className="border-subtle bg-default mt-6 flex min-h-24 flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">
          {t("billing_status_widget_eyebrow")}
        </p>
        <p className="font-cal text-emphasis mt-1 text-xl font-semibold">
          {t(`billing_plan_${plan.toLowerCase()}`)}
        </p>
        {seats ? (
          <p className="text-subtle mt-1 text-sm">
            {t("billing_status_widget_seats", { limit: seats.limit, used: seats.accepted })}
          </p>
        ) : null}
      </div>
      {canManageBilling ? (
        <Button color="secondary" href={actionHref} size="sm">
          {t(plan === "FREE" ? "billing_compare_plans" : "billing_manage_plan")}
        </Button>
      ) : null}
    </aside>
  );
}

export { BillingStatusWidget };
```

The component intentionally does not destructure or render `seats.billed`.

- [ ] **Step 5: Add the exact Convenio copy**

Add these keys next to the existing billing strings in `packages/i18n/locales/en/common.json`:

```json
"billing_status_widget_eyebrow": "PLAN IN USE",
"billing_status_widget_seats": "{{used}} of {{limit}} seats in use",
"billing_status_widget_loading": "Loading plan status",
"billing_status_widget_unavailable": "Plan status is quiet for a moment. Your calendar is still working.",
"billing_status_widget_retry": "Check again",
"billing_manage_plan": "Manage plan",
```

- [ ] **Step 6: Run RED-to-GREEN checks for Task B**

Run:

```bash
TZ=UTC yarn test apps/web/modules/billing/BillingStatusWidget.test.tsx
yarn biome check --write apps/web/modules/billing/BillingStatusWidget.tsx apps/web/modules/billing/BillingStatusWidget.test.tsx packages/i18n/locales/en/common.json
TZ=UTC yarn test apps/web/modules/billing/BillingStatusWidget.test.tsx
```

Expected: all widget tests pass before and after formatting; there is no text containing the billed count and no action on the ordinary-member or error states.

- [ ] **Step 7: Commit Task B**

```bash
git add apps/web/modules/billing/BillingStatusWidget.tsx apps/web/modules/billing/BillingStatusWidget.test.tsx packages/i18n/locales/en/common.json
git commit -m "feat(billing): add plan status widget"
```

Expected: one focused commit changing 3 code files and remaining below 500 changed lines.

---

### Task C: Authenticated Shell Mount

**Files:**
- Modify: `apps/web/modules/shell/Shell.tsx:1-119,208-223`
- Create: `apps/web/modules/shell/Shell.test.tsx`

**Interfaces:**
- Consumes: `BillingStatusWidget(): JSX.Element` from Task B.
- Produces: one authenticated widget mount after page content inside `MainContainer`; zero mounts in `PublicShell`, `Dock`, and page-level code.

- [ ] **Step 1: Write a failing authenticated/public mount regression test**

Create `apps/web/modules/shell/Shell.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/features/auth/lib/useCurrentSession", () => ({
  useCurrentSession: () => ({ status: "unauthenticated" }),
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ isLocaleReady: true, t: (key: string) => key }),
}));
vi.mock("@calcom/ui/components/errorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@calcom/web/modules/auth/hooks/useRedirectToLoginIfUnauthenticated", () => ({
  useRedirectToLoginIfUnauthenticated: vi.fn(),
}));
vi.mock("@calcom/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded", () => ({
  useRedirectToOnboardingIfNeeded: vi.fn(),
}));
vi.mock("@calcom/web/modules/billing/BillingStatusWidget", () => ({
  BillingStatusWidget: () => <div data-testid="billing-status-widget" />,
}));
vi.mock("@calcom/web/modules/billing/UpgradePromptProvider", () => ({
  UpgradePromptProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@calcom/web/modules/formbricks/hooks/useFormbricks", () => ({ useFormbricks: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("./banners/LayoutBanner", () => ({ BannerContainer: () => null }));
vi.mock("./banners/useBanners", () => ({ useBanners: () => ({ banners: null, bannersHeight: 0 }) }));
vi.mock("./Dock", () => ({ DockContainer: () => <div data-testid="dock" /> }));
vi.mock("./DynamicModals", () => ({ DynamicModals: () => null }));
vi.mock("./Kbar", () => ({
  KBarContent: () => null,
  KBarRoot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./useAppTheme", () => ({ useAppTheme: vi.fn() }));

import Shell from "./Shell";

describe("Shell billing status", () => {
  it("mounts billing status exactly once beside authenticated content", () => {
    const view = render(
      <Shell>
        <div data-testid="page-content" />
      </Shell>
    );

    expect(view.getByTestId("page-content")).toBeInTheDocument();
    expect(view.getAllByTestId("billing-status-widget")).toHaveLength(1);
    expect(view.getByTestId("dock")).toBeInTheDocument();
  });

  it("does not mount billing status in a public shell", () => {
    const view = render(
      <Shell isPublic>
        <div data-testid="public-content" />
      </Shell>
    );

    expect(view.getByTestId("public-content")).toBeInTheDocument();
    expect(view.queryByTestId("billing-status-widget")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the shell test to verify RED**

Run:

```bash
TZ=UTC yarn test apps/web/modules/shell/Shell.test.tsx
```

Expected: the authenticated case FAILS because `billing-status-widget` is absent; the public case already passes.

- [ ] **Step 3: Mount the widget only through the authenticated shell branch**

In `Shell.tsx`, add the direct source import:

```ts
import { BillingStatusWidget } from "@calcom/web/modules/billing/BillingStatusWidget";
```

Define an internal layout type without widening the exported page-facing `LayoutProps`, then use it for `Layout` and `MainContainer`:

```ts
type InternalLayoutProps = LayoutProps & { billingStatus?: ReactNode };

const Layout = (props: InternalLayoutProps) => {
```

Change only the authenticated branch of `Shell`:

```tsx
return !props.isPublic ? (
  <UpgradePromptProvider>
    <KBarWrapper withKBar>
      <Layout {...props} billingStatus={<BillingStatusWidget />} />
    </KBarWrapper>
  </UpgradePromptProvider>
) : (
  <PublicShell {...props} />
);
```

Finally, consume the internal node in `MainContainer` and render it after the page error boundary, inside the existing max-width content canvas:

```tsx
function MainContainer({
  TopNavContainer: TopNavContainerProp = null,
  billingStatus,
  ...props
}: InternalLayoutProps) {
  return (
    <main className="bg-default relative z-0 flex-1 focus:outline-none">
      {TopNavContainerProp}
      <div className="mx-auto max-w-[1200px] p-2 pb-28 sm:p-4 sm:pb-28 lg:p-6 lg:pb-28">
        <ErrorBoundary>
          {!props.withoutMain ? <ShellMain {...props}>{props.children}</ShellMain> : props.children}
        </ErrorBoundary>
        {billingStatus}
      </div>
    </main>
  );
}
```

Do not add the widget to `DockContainer`, `PageWrapper`, `PublicShell`, individual routes, or `LayoutProps`.

- [ ] **Step 4: Run RED-to-GREEN checks for Task C**

Run:

```bash
TZ=UTC yarn test apps/web/modules/shell/Shell.test.tsx apps/web/modules/billing/BillingStatusWidget.test.tsx
yarn biome check --write apps/web/modules/shell/Shell.tsx apps/web/modules/shell/Shell.test.tsx
TZ=UTC yarn test apps/web/modules/shell/Shell.test.tsx apps/web/modules/billing/BillingStatusWidget.test.tsx
```

Expected: both shell tests and all widget tests pass before and after formatting; authenticated content and the widget coexist, public content has no widget, and Dock remains a separate sibling.

- [ ] **Step 5: Run the complete slice verification**

Run:

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/billing/billing.handler.test.ts apps/web/modules/billing/BillingStatusWidget.test.tsx apps/web/modules/shell/Shell.test.tsx
yarn biome check packages/trpc/server/routers/viewer/billing/_router.ts packages/trpc/server/routers/viewer/billing/billing.handler.ts packages/trpc/server/routers/viewer/billing/billing.handler.test.ts apps/web/modules/billing/BillingStatusWidget.tsx apps/web/modules/billing/BillingStatusWidget.test.tsx apps/web/modules/shell/Shell.tsx apps/web/modules/shell/Shell.test.tsx packages/i18n/locales/en/common.json
yarn type-check:ci --force
git diff --check
```

Expected: all focused tests pass; Biome reports no diagnostics; the forced monorepo type check passes; `git diff --check` prints nothing.

- [ ] **Step 6: Perform the slice safety inspection**

Run:

```bash
rg -n "polar(Customer|Subscription|Product)Id|credential\.key|customerEmail|clerkOrganizationId" packages/trpc/server/routers/viewer/billing apps/web/modules/billing/BillingStatusWidget.tsx
rg -n "BillingStatusWidget" apps/web/modules/shell apps/web/app
git diff --stat HEAD~2..HEAD
```

Expected: the first command finds existing provider fields only in unrelated command/projection implementation and none in the new summary return or widget; the second command finds one source import and one authenticated render in `Shell.tsx` plus the focused shell test, with no page or Dock mount; the diff stat stays under 500 changed lines per task and at or below 10 code files per commit.

- [ ] **Step 7: Commit Task C**

```bash
git add apps/web/modules/shell/Shell.tsx apps/web/modules/shell/Shell.test.tsx
git commit -m "feat(billing): show plan status in app shell"
```

Expected: one focused commit changing 2 code files and remaining below 500 changed lines.

## Final Review Checklist

- [ ] `viewer.billing.summary` has no input schema and no client-controlled organization selector.
- [ ] Active profile organization access requires an accepted membership and a non-archived organization; an invalid context falls back to the personal subject.
- [ ] Effective plan, grace periods, subscription status, and the Team seat limit come from `getEntitlements`.
- [ ] Accepted seats come from a filtered membership count; pending memberships are excluded.
- [ ] Ordinary members receive `billed: null` and no management link; only accepted owners/admins receive organization plan actions.
- [ ] Personal Free, personal paid, organization Free, and organization paid links preserve the correct subject.
- [ ] The widget never renders billed quantity or provider identifiers.
- [ ] Loading and failure cards do not replace or block page content; failure exposes Retry but no billing action.
- [ ] The widget mounts exactly once in authenticated `Shell` main content, never in `PublicShell`, `Dock`, `PageWrapper`, or page routes.
- [ ] All copy is translated and matches the approved Convenio voice.
- [ ] Focused tests, Biome, forced type checking, safety searches, line/file limits, and `git diff --check` pass.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-convenio-billing-summary.md`. Execute it with subagent-driven development: dispatch a fresh implementer for each task, run a specification review and code-quality review after each task, and use one focused fix pass for any findings before advancing.
