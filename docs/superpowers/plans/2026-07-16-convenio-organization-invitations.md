# Convenio Organization Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Team owners and admins manage accepted members and Clerk-backed pending invitations from settings and onboarding, with accurate 50-seat communication and no new billing source of truth.

**Architecture:** Prisma remains the accepted-member projection, Clerk remains the pending-invitation source, and `EntitlementService` remains the source for active Team capability and the 50-member limit. Extend the existing command service and tRPC router, then build one reusable panel for settings and onboarding. Resend is serialized revoke-and-recreate because Clerk exposes list/create/revoke but no resend mutation.

**Tech Stack:** TypeScript, Prisma, Clerk Backend SDK, Polar-backed entitlements, tRPC, Next.js App Router, React, Vitest, Testing Library, Biome.

## Global Constraints

- Do not change Polar checkout, webhooks, product configuration, entitlement definitions, or seat synchronization order.
- Count only accepted local memberships as used/billed seats; pending Clerk invitations never count.
- Team remains capped at exactly 50 accepted members through `acceptedOrganizationMembers`.
- Use Prisma `select`, never `include`; never expose Clerk IDs, provider URLs/errors, credentials, or credential keys.
- Only accepted OWNER and ADMIN memberships may manage invitations or members; preserve last-owner protection.
- Put authentication and membership checks in `page.tsx`, not a layout.
- Put all visible copy in `packages/i18n/locales/en/common.json`.
- Keep every task below 500 changed code lines and at no more than 10 code files.
- Do not start localhost:3000 or run E2E until the user explicitly enables the final E2E pass.

---

### Task 1: Add Clerk pending-invitation commands

**Files:**
- Modify: `packages/features/organizations/services/ClerkOrganizationCommandService.ts`
- Modify: `packages/features/organizations/services/ClerkOrganizationCommandService.test.ts`
- Modify: `packages/lib/errorCodes.ts`

**Interfaces:**
- Consumes: existing organization authorization, `EntitlementService.forOrganization`, `assertEntitled`, `assertWithinLimit`, and Clerk organization invitation APIs.
- Produces:

```ts
type PendingOrganizationInvitation = {
  createdAt: Date;
  email: string;
  id: string;
  role: "org:admin" | "org:member";
};

listPendingInvitations(input: { actorUserId: number; organizationId: number }): Promise<PendingOrganizationInvitation[]>;
revokeInvitation(input: { actorUserId: number; invitationId: string; organizationId: number }): Promise<void>;
resendInvitation(input: { actorUserId: number; invitationId: string; organizationId: number }): Promise<void>;
```

- [ ] **Step 1: Write failing service tests**

Extend `setup()` with `listPendingInvitations` and `revokeInvitation`. Test safe pending mapping, admin authorization, unknown ID, sanitized provider failure, duplicate email, full-team invite, revoke, and serialized resend ordering.

```ts
it("blocks a new invitation when all 50 accepted seats are used", async () => {
  const ctx = setup();
  ctx.entitlements.forOrganization.mockResolvedValue({
    ...teamEntitlements(),
    usage: { acceptedOrganizationMembers: 50, activePersonalEventTypes: 0, connectedCalendars: 0 },
  });
  const service = new ClerkOrganizationCommandService(ctx.dependencies);
  await expect(service.inviteMember({
    actorUserId: 7,
    email: "new@example.com",
    organizationId: 41,
    role: "org:member",
  })).rejects.toMatchObject({ code: ErrorCode.EntitlementLimitExceeded });
  expect(ctx.clerk.inviteMember).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED**

```bash
TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationCommandService.test.ts
```

Expected: FAIL because pending operations and invite-time capacity enforcement do not exist.

- [ ] **Step 3: Add the error and gateway operations**

Add `ClerkOrganizationInvitationDuplicate` to `ErrorCode`. Extend the private gateway:

```ts
async listPendingInvitations(clerkOrganizationId: string): Promise<PendingOrganizationInvitation[]> {
  const response = await getClerkBackendClient().organizations.getOrganizationInvitationList({
    organizationId: clerkOrganizationId,
    status: ["pending"],
  });
  return response.data.map((invitation) => ({
    createdAt: new Date(invitation.createdAt),
    email: invitation.emailAddress,
    id: invitation.id,
    role: invitation.role,
  }));
}

async revokeInvitation(input: {
  clerkOrganizationId: string;
  invitationId: string;
  requestingClerkUserId: string;
}): Promise<void> {
  await getClerkBackendClient().organizations.revokeOrganizationInvitation({
    invitationId: input.invitationId,
    organizationId: input.clerkOrganizationId,
    requestingUserId: input.requestingClerkUserId,
  });
}
```

- [ ] **Step 4: Implement service behavior**

Before create/resend, assert Team capability and current capacity:

```ts
const entitlements = await this.dependencies.entitlements.forOrganization(input.organizationId);
assertEntitled(entitlements, "canInviteOrganizationMembers");
assertWithinLimit(entitlements, "acceptedOrganizationMembers", entitlements.usage.acceptedOrganizationMembers);
```

Compare duplicate pending emails using `trim().toLowerCase()`. Revoke/resend run through `serialize`; resend reloads the invitation by opaque ID, revokes it, and recreates it with the provider-sourced email and role. Unknown IDs use `NotFound`; all provider detail is sanitized.

- [ ] **Step 5: Run GREEN and commit**

```bash
TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationCommandService.test.ts
yarn biome check --write packages/features/organizations/services/ClerkOrganizationCommandService.ts packages/features/organizations/services/ClerkOrganizationCommandService.test.ts packages/lib/errorCodes.ts
git diff --check
git add packages/features/organizations/services/ClerkOrganizationCommandService.ts packages/features/organizations/services/ClerkOrganizationCommandService.test.ts packages/lib/errorCodes.ts
git commit -m "feat(organizations): add invitation commands"
```

---

### Task 2: Expose a safe organization-members API

**Files:**
- Modify: `packages/trpc/server/routers/viewer/organizations/_router.ts`
- Modify: `packages/trpc/server/routers/viewer/organizations/organizations.schema.ts`
- Modify: `packages/trpc/server/routers/viewer/organizations/organizations.handler.ts`
- Modify: `packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts`

**Interfaces:**
- Consumes: Task 1 methods and the existing accepted-member Prisma projection.
- Produces:

```ts
type OrganizationMembersView = {
  acceptedSeats: number;
  actorRole: "OWNER" | "ADMIN" | "MEMBER";
  canManageInvitations: boolean;
  id: number;
  members: Array<{ avatarUrl: string | null; email: string; id: number; name: string | null; role: "OWNER" | "ADMIN" | "MEMBER" }>;
  name: string;
  pendingInvitations: Array<{ createdAt: Date; email: string; id: string; role: "ADMIN" | "MEMBER" }>;
  seatLimit: number;
  slug: string | null;
};
```

- [ ] **Step 1: Write failing handler tests**

Test owner/admin projection, ordinary-member accepted-seat visibility with no pending/provider call, missing membership denial, role mapping, revoke/resend actor propagation, and a recursive key scan proving no `/clerk|provider|credential|url/i` key leaves the handler.

```ts
expect(result).toMatchObject({
  acceptedSeats: 4,
  canManageInvitations: true,
  pendingInvitations: [{ email: "pending@example.com", id: "inv_1", role: "MEMBER" }],
  seatLimit: 50,
});
```

- [ ] **Step 2: Run RED**

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts
```

- [ ] **Step 3: Add schemas and procedures**

```ts
const invitationId = z.string().trim().min(1).max(128);
const ZOrganizationInvitationSchema = ZOrganizationIdSchema.extend({ invitationId });
```

Add authenticated `members` query and `revokeInvitation`/`resendInvitation` mutations. Resend accepts only organization and invitation IDs, never browser-supplied email/role.

- [ ] **Step 4: Build the safe read model**

Determine actor role from the accepted-member result. Load `EntitlementService.forOrganization` for active capability, and read the exact configured capacity from `PLAN_ENTITLEMENTS.TEAM.acceptedOrganizationMembers` so a provisional organization says `1 of 50`, never `1 of 0`. Call Clerk pending-list only for OWNER/ADMIN; an ordinary member receives `canManageInvitations: false` and `pendingInvitations: []`. Return only `OrganizationMembersView`.

- [ ] **Step 5: Run GREEN and commit**

```bash
TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts
yarn biome check --write packages/trpc/server/routers/viewer/organizations/_router.ts packages/trpc/server/routers/viewer/organizations/organizations.schema.ts packages/trpc/server/routers/viewer/organizations/organizations.handler.ts packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts
git diff --check
git add packages/trpc/server/routers/viewer/organizations
git commit -m "feat(organizations): expose member management"
```

---

### Task 3: Build the reusable members panel and settings page

**Files:**
- Create: `apps/web/modules/organizations/OrganizationMembersPanel.tsx`
- Create: `apps/web/modules/organizations/OrganizationMembersPanel.test.tsx`
- Create: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/organizations/members/page.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: Task 2 organization procedures.
- Produces: `<OrganizationMembersPanel organizationId: number initialData?: RouterOutputs["viewer"]["organizations"]["members"] />`.

- [ ] **Step 1: Write failing component tests**

Cover `4 of 50 seats in use`, the billed-seat explanation, separate accepted/pending sections, pending not incrementing seats, invite email/role controls, resend/revoke invalidation, distinct invalid/duplicate/full/permission/provider errors, disabled controls at 50, ordinary-member read-only state, accessible pending labels, and pending mutation states.

- [ ] **Step 2: Run RED**

```bash
TZ=UTC yarn test apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
```

- [ ] **Step 3: Implement the shared panel**

Use shared UI primitives and token classes. Derive:

```ts
const isFull = data.acceptedSeats >= data.seatLimit;
const canInvite = data.canManageInvitations && !isFull;
```

Invalidate `viewer.organizations.members({ organizationId })` after mutations. Map tRPC error codes to exact translated duplicate/full/permission/provider messages; reject invalid email inline before mutation. OWNER/ADMIN users also receive role-change and removal controls for accepted members through the existing procedures; keep the last OWNER action disabled in the client while the server remains authoritative.

- [ ] **Step 4: Add the guarded settings page**

Parse a positive `organizationId` search parameter. Use `getTRPCContext`; redirect unauthenticated users with a safe callback. Query Prisma with `select: { id: true, members: { where: { accepted: true, userId }, select: { role: true } } }`; return not-found without accepted membership. Use the organization router caller for `initialData`.

- [ ] **Step 5: Add Convenio copy, run GREEN, and commit**

Add translations for accepted/pending headings, seat/billed-seat lines, labels/actions, full-team/Team-required states, and distinct errors. Never call pending invitations seats.

```bash
TZ=UTC yarn test apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
yarn biome check --write apps/web/modules/organizations/OrganizationMembersPanel.tsx apps/web/modules/organizations/OrganizationMembersPanel.test.tsx 'apps/web/app/(use-page-wrapper)/settings/(settings-layout)/organizations/members/page.tsx' packages/i18n/locales/en/common.json
git diff --check
git add apps/web/modules/organizations/OrganizationMembersPanel.tsx apps/web/modules/organizations/OrganizationMembersPanel.test.tsx 'apps/web/app/(use-page-wrapper)/settings/(settings-layout)/organizations/members/page.tsx' packages/i18n/locales/en/common.json
git commit -m "feat(organizations): add members settings"
```

---

### Task 4: Link settings and the dashboard to invitations

**Files:**
- Modify: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/modules/billing/BillingStatusWidget.tsx`
- Modify: `apps/web/modules/billing/BillingStatusWidget.test.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Consumes: `/settings/organizations/members?organizationId={positive integer}` and the widget's existing organization subject ID.
- Produces: same-origin settings and `Invite team` dashboard links.

- [ ] **Step 1: Add failing tests**

Assert a Team billing manager gets `Invite team` linking organization 41; ordinary members/personal plans do not. Assert organization settings uses the same local path when `orgBranding.id` exists.

- [ ] **Step 2: Implement and verify**

Remove the obsolete `/settings/organizations/members → /members` redirect. Replace the external members nav entry with the local route. Add a secondary widget action only for an organization subject with management permission.

```bash
TZ=UTC yarn test apps/web/modules/billing/BillingStatusWidget.test.tsx
yarn biome check --write 'apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx' apps/web/next.config.ts apps/web/modules/billing/BillingStatusWidget.tsx apps/web/modules/billing/BillingStatusWidget.test.tsx packages/i18n/locales/en/common.json
git diff --check
git add 'apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx' apps/web/next.config.ts apps/web/modules/billing/BillingStatusWidget.tsx apps/web/modules/billing/BillingStatusWidget.test.tsx packages/i18n/locales/en/common.json
git commit -m "feat(organizations): link team invitations"
```

---

### Task 5: Return Team onboarding to the invitation panel

**Files:**
- Modify: `apps/web/modules/billing/upgradeIntent.ts`
- Modify: `apps/web/modules/billing/upgradeIntent.test.ts`
- Modify: `apps/web/modules/onboarding/complete/completion-view.tsx`
- Modify: `apps/web/modules/onboarding/complete/completion-view.test.tsx`

**Interfaces:**
- Consumes: Task 3 panel and current safe billing restoration.
- Produces:

```ts
type UpgradeCapability = "bookingAudit" | "organizationInvitations";
type UpgradeResume =
  | { kind: "openBookingAudit"; bookingUid: string }
  | { kind: "openOrganizationInvitations"; organizationId: number };
```

- [ ] **Step 1: Write failing safety and completion tests**

Test exact-key parsing, positive IDs, same-origin return, 30-minute expiry, organization subject match, cross-pair rejection, successful Team intent storage, no storage for Pro/Free/member/missing team, panel visibility for managers, and the existing skippable Free behavior.

- [ ] **Step 2: Run RED**

```bash
TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/onboarding/complete/completion-view.test.tsx
```

- [ ] **Step 3: Extend the strict parser**

Branch resume parsing by exact `kind` and exact key set. Accept `organizationInvitations` only with `openOrganizationInvitations`, `requiredPlan: "TEAM"`, a positive organization ID, and the matching organization subject. Preserve booking-audit validation.

- [ ] **Step 4: Store Team return intent and render the panel**

Use `usePaidPlanCheckout({ onBeforeNavigate })` to save:

```ts
saveUpgradeIntent({
  capability: "organizationInvitations",
  requiredPlan: "TEAM",
  resume: { kind: "openOrganizationInvitations", organizationId },
  returnTo: "/onboarding/complete",
}, { subject: { kind: "organization", organizationId } });
```

Render the panel for created-team and accepted OWNER/ADMIN contexts. Before Team activation it shows Team-required state; after billing restoration it permits invites. Ordinary members keep the existing manager message; Free remains skippable.

- [ ] **Step 5: Run all code-level gates and commit**

```bash
TZ=UTC yarn test apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/onboarding/complete/completion-view.test.tsx apps/web/modules/organizations/OrganizationMembersPanel.test.tsx
yarn biome check --write apps/web/modules/billing/upgradeIntent.ts apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/onboarding/complete/completion-view.tsx apps/web/modules/onboarding/complete/completion-view.test.tsx
yarn type-check:ci --force
git diff --check
git add apps/web/modules/billing/upgradeIntent.ts apps/web/modules/billing/upgradeIntent.test.ts apps/web/modules/onboarding/complete/completion-view.tsx apps/web/modules/onboarding/complete/completion-view.test.tsx
git commit -m "feat(onboarding): return Team setup to invitations"
```

## Deferred End-of-Project Verification

When the user explicitly permits the final server run, use fresh `+clerk_test` accounts with code `424242` for owner, admin, member, pending, duplicate, resend/revoke, 50-seat, Team checkout return, dashboard link, and settings link. Until then, no task restarts localhost:3000.
