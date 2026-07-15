# Clerk Organization Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize Clerk organizations, invitations, memberships, and roles into Convenio's existing top-level organization and permission models without destructive deletes.

**Architecture:** Each Clerk organization maps one-to-one to a local top-level `Team` with `isOrganization = true`. Convenio organization commands call Clerk first and synchronously reconcile local state; verified Clerk webhooks repair missed writes. Local `Membership` and permission checks remain authoritative for scheduling, while Clerk owns invitation acceptance and identity-side roles.

**Tech Stack:** Clerk Backend SDK, Next.js route handlers, Prisma/PostgreSQL, tRPC, TypeScript, Vitest, Playwright.

## Global Constraints

- Synchronize only top-level organizations; nested teams, custom roles, SSO, SCIM, and directory sync are excluded.
- Map creator to `OWNER`, other `org:admin` members to `ADMIN`, and `org:member` members to `MEMBER`.
- Every active organization must retain at least one accepted local owner.
- External deletion sets `Team.archivedAt`; it never cascades through bookings, schedules, event types, profiles, or memberships.
- Pending Clerk invitations do not create accepted local membership and do not consume a billing seat.
- A member is locally activated only after the billing seat update succeeds.
- Verify webhook signatures before parsing or writing; store sanitized event records and make duplicates successful no-ops.
- Use direct source imports, Prisma `select`, `ErrorWithCode` in services, translated UI strings, and reviewable commits.

---

## File Structure

- `packages/prisma/schema.prisma`: Clerk organization mapping, archive timestamp, and external webhook ledger.
- `packages/prisma/migrations/20260715100000_add_clerk_organization_mapping/migration.sql`: additive organization and event-ledger schema.
- `packages/features/organizations/services/ClerkOrganizationSyncService.ts`: local projection and invariants.
- `packages/features/organizations/services/ClerkOrganizationCommandService.ts`: Clerk-first create/invite/role/remove operations.
- `packages/features/organizations/services/OrganizationSeatBillingPort.ts`: billing boundary implemented by Polar in the billing plan.
- `packages/features/organizations/services/*.test.ts`: synchronization and owner-invariant tests.
- `apps/web/app/api/webhooks/clerk/route.ts`: verified, idempotent Clerk event ingestion.
- `packages/trpc/server/routers/viewer/organizations/*`: authenticated organization procedures.
- `packages/trpc/server/routers/viewer/_router.tsx`: router registration.
- `apps/web/modules/organizations/*`: organization management UI.
- `apps/web/playwright/auth/clerk-organizations.e2e.ts`: browser and direct-API authorization acceptance.

### Task 1: Add organization mappings and the provider event ledger

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260715100000_add_clerk_organization_mapping/migration.sql`
- Create: `packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

**Interfaces:**
- Produces: `Team.clerkOrganizationId: string | null`, `Team.archivedAt: Date | null`.
- Produces: `ExternalWebhookEvent` unique on `(provider, externalEventId)` with processing metadata and no raw payload.

- [ ] **Step 1: Write persistence tests for mappings and duplicate events**

```ts
it("enforces one local organization per Clerk organization", async () => {
  await createOrganization({ clerkOrganizationId: "org_same" });
  await expect(createOrganization({ clerkOrganizationId: "org_same" })).rejects.toMatchObject({ code: "P2002" });
});

it("deduplicates a provider event id", async () => {
  await claimEvent({ provider: "CLERK", externalEventId: "evt_same", type: "organization.created" });
  await expect(claimEvent({ provider: "CLERK", externalEventId: "evt_same", type: "organization.created" })).resolves.toEqual({ duplicate: true });
});
```

- [ ] **Step 2: Run the test and confirm the fields/models are missing**

Run: `TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

Expected: FAIL on unknown Prisma fields/models.

- [ ] **Step 3: Add the additive schema**

```prisma
enum ExternalWebhookProvider { CLERK POLAR }
enum ExternalWebhookProcessingState { PROCESSING SUCCEEDED FAILED }

model ExternalWebhookEvent {
  id              String                         @id @default(uuid())
  provider        ExternalWebhookProvider
  externalEventId String
  type            String
  state           ExternalWebhookProcessingState @default(PROCESSING)
  attempts        Int                            @default(1)
  payloadHash     String
  effectiveAt     DateTime?
  processedAt     DateTime?
  sanitizedError  String?
  createdAt       DateTime                       @default(now())
  updatedAt       DateTime                       @updatedAt

  @@unique([provider, externalEventId])
  @@index([provider, state])
}
```

Add `clerkOrganizationId String? @unique` and `archivedAt DateTime?` to `Team`. The migration uses `ALTER TABLE` and unique indexes without rewriting existing rows.

- [ ] **Step 4: Generate schemas and run the focused test**

Run: `yarn workspace @calcom/prisma generate-schemas && TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

Expected: schema generation and persistence tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/20260715100000_add_clerk_organization_mapping/migration.sql packages/features/organizations/services/ClerkOrganizationSyncService.test.ts
git commit -m "feat(organizations): add Clerk organization mappings"
```

### Task 2: Project Clerk organizations and memberships locally

**Files:**
- Create: `packages/features/organizations/services/ClerkOrganizationSyncService.ts`
- Modify: `packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

**Interfaces:**
- Consumes: `ClerkOrganizationSnapshot { id; name; slug; deleted; memberships: Array<{ clerkUserId; role; active }> }`.
- Produces: `reconcileOrganization(snapshot): Promise<{ organizationId: number; acceptedSeats: number; archived: boolean }>`.
- Error codes: `CLERK_ORGANIZATION_OWNER_REQUIRED`, `CLERK_MEMBER_LOCAL_USER_MISSING`, `CLERK_ORGANIZATION_CONFLICT`.

- [ ] **Step 1: Add projection and invariant tests**

Cover create, rename, slug collision, creator owner, admin/member mapping, invitation-not-accepted, member removal, role change, missing local user, replay, archive, and refusal to remove the last owner.

```ts
it("archives instead of deleting", async () => {
  const result = await service.reconcileOrganization(snapshot({ deleted: true }));
  expect(result.archived).toBe(true);
  await expect(prisma.team.findUnique({ where: { id: result.organizationId }, select: { archivedAt: true } })).resolves.toMatchObject({ archivedAt: expect.any(Date) });
});
```

- [ ] **Step 2: Run the service test and confirm projection cases fail**

Run: `TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

Expected: FAIL because `ClerkOrganizationSyncService` is absent.

- [ ] **Step 3: Implement transactional local reconciliation**

Resolve local users only by `clerkUserId`. Create or update a top-level organization using `select`. Upsert accepted memberships with the exact role mapping, deactivate removed memberships without deleting user data, create required organization profiles using existing profile rules, and enforce an accepted owner before commit.

```ts
const roleMap = {
  "org:admin": MembershipRole.ADMIN,
  "org:member": MembershipRole.MEMBER,
} as const;
```

The synchronous creator path passes `creatorClerkUserId` and upgrades that member to `OWNER` locally even though Clerk represents it as `org:admin`.

- [ ] **Step 4: Run tests and format**

Run: `TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationSyncService.test.ts && yarn biome check --write packages/features/organizations/services/ClerkOrganizationSyncService.ts packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

Expected: all reconciliation and owner-invariant tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/features/organizations/services/ClerkOrganizationSyncService.ts packages/features/organizations/services/ClerkOrganizationSyncService.test.ts
git commit -m "feat(organizations): reconcile Clerk organizations"
```

### Task 3: Verify and process Clerk webhooks idempotently

**Files:**
- Create: `apps/web/app/api/webhooks/clerk/route.ts`
- Create: `apps/web/app/api/webhooks/clerk/route.test.ts`
- Create: `packages/features/organizations/services/ClerkWebhookService.ts`
- Create: `packages/features/organizations/services/ClerkWebhookService.test.ts`

**Interfaces:**
- Endpoint: `POST /api/webhooks/clerk`.
- Consumes: Clerk Svix headers and `CLERK_WEBHOOK_SIGNING_SECRET`.
- Handles: `user.created`, `user.updated`, `organization.created`, `organization.updated`, `organization.deleted`, membership created/updated/deleted, and invitation accepted/revoked events.
- Returns: `200` for success or duplicate, `400` for invalid payload, `401` for invalid signature, `500` for a claimed processing failure.

- [ ] **Step 1: Write route tests before the handler**

```ts
it("rejects before parsing when the signature is invalid", async () => {
  const response = await POST(unsignedRequest("not-json"));
  expect(response.status).toBe(401);
  expect(reconcileOrganization).not.toHaveBeenCalled();
});

it("acknowledges a duplicate without applying it twice", async () => {
  await POST(signedRequest(event));
  const response = await POST(signedRequest(event));
  expect(response.status).toBe(200);
  expect(reconcileOrganization).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run route and service tests**

Run: `TZ=UTC yarn test apps/web/app/api/webhooks/clerk/route.test.ts packages/features/organizations/services/ClerkWebhookService.test.ts`

Expected: FAIL because route and service modules are missing.

- [ ] **Step 3: Implement signature-first ingestion and event claiming**

Read the raw request body once, verify it with Clerk's supported webhook verifier, hash it with SHA-256, claim `(CLERK, event.id)`, then dispatch a sanitized snapshot. Mark success or sanitized failure; never persist the raw payload.

- [ ] **Step 4: Run invalid-signature, duplicate, retry, and projection tests**

Run: `TZ=UTC yarn test apps/web/app/api/webhooks/clerk/route.test.ts packages/features/organizations/services/ClerkWebhookService.test.ts packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

Expected: all webhook safety cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/webhooks/clerk/route.ts apps/web/app/api/webhooks/clerk/route.test.ts packages/features/organizations/services/ClerkWebhookService.ts packages/features/organizations/services/ClerkWebhookService.test.ts
git commit -m "feat(organizations): process Clerk webhooks"
```

### Task 4: Add Clerk-first organization commands

**Files:**
- Create: `packages/features/organizations/services/ClerkOrganizationCommandService.ts`
- Create: `packages/features/organizations/services/ClerkOrganizationCommandService.test.ts`
- Create: `packages/features/organizations/services/OrganizationSeatBillingPort.ts`

**Interfaces:**
- Produces: `createOrganization`, `inviteMember`, `changeMemberRole`, `removeMember`, `archiveOrganization`.
- Requires: current local user with `clerkUserId`; admin/owner checks use local accepted membership.
- Seat boundary: `activateAcceptedMember` calls `OrganizationSeatBillingPort.syncAcceptedSeats({ organizationId, desiredSeats })` before setting local `accepted=true`.

- [ ] **Step 1: Write command ordering and compensation tests**

```ts
it("does not activate a member when seat synchronization fails", async () => {
  polarSeats.sync.mockRejectedValue(new ErrorWithCode("BILLING_SEAT_UPDATE_FAILED"));
  await expect(service.activateAcceptedMember(input)).rejects.toMatchObject({ code: "BILLING_SEAT_UPDATE_FAILED" });
  expect(membershipRepository.accept).not.toHaveBeenCalled();
});
```

Also assert non-admin denial, Clerk-first create, local reconciliation, idempotent retry, last-owner refusal, and remove-member seat decrement.

- [ ] **Step 2: Run tests and confirm the command service is absent**

Run: `TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationCommandService.test.ts`

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement commands with recoverable provider failures**

Each command validates local authorization, calls Clerk, fetches the resulting Clerk organization snapshot, and invokes `reconcileOrganization`. Convert Clerk failures to `ErrorWithCode` values that expose no provider secrets. Use a per-organization advisory lock or serialized queue for accepted-member transitions. Define and inject this boundary so organization work compiles before Polar is implemented:

```ts
export interface OrganizationSeatBillingPort {
  syncAcceptedSeats(input: { organizationId: number; desiredSeats: number }): Promise<void>;
}
```

- [ ] **Step 4: Run service tests**

Run: `TZ=UTC yarn test packages/features/organizations/services/ClerkOrganizationCommandService.test.ts packages/features/organizations/services/ClerkOrganizationSyncService.test.ts`

Expected: command ordering, recovery, and permission tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/features/organizations/services/ClerkOrganizationCommandService.ts packages/features/organizations/services/ClerkOrganizationCommandService.test.ts packages/features/organizations/services/OrganizationSeatBillingPort.ts
git commit -m "feat(organizations): add Clerk organization commands"
```

### Task 5: Expose authenticated organization procedures

**Files:**
- Create: `packages/trpc/server/routers/viewer/organizations/_router.ts`
- Create: `packages/trpc/server/routers/viewer/organizations/organizations.schema.ts`
- Create: `packages/trpc/server/routers/viewer/organizations/organizations.handler.ts`
- Create: `packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts`
- Modify: `packages/trpc/server/routers/viewer/_router.tsx`

**Interfaces:**
- Procedures: `viewer.organizations.create`, `invite`, `changeRole`, `removeMember`, `archive`, `get`.
- Role inputs accept only `ADMIN` or `MEMBER`; local `OWNER` transfer is a separate explicit operation and never inferred from Clerk's `org:admin`.

- [ ] **Step 1: Write procedure authorization tests**

Assert anonymous rejection, member rejection on mutations, admin invite/role/remove, owner archive/ownership transfer, archived organization read-only behavior, and invalid organization ID denial.

- [ ] **Step 2: Run the focused handler test**

Run: `TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts`

Expected: FAIL because the router is absent.

- [ ] **Step 3: Add Zod schemas, thin handlers, and router registration**

Handlers read the authenticated local user ID from `ctx.session`, call the command service, and map `ErrorWithCode` to `TRPCError` at the router boundary. Do not place business logic in handlers or repositories.

- [ ] **Step 4: Run handler and router type checks**

Run: `TZ=UTC yarn test packages/trpc/server/routers/viewer/organizations/organizations.handler.test.ts && yarn workspace @calcom/trpc type-check`

Expected: procedure authorization tests and tRPC type check pass.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/server/routers/viewer/organizations packages/trpc/server/routers/viewer/_router.tsx
git commit -m "feat(organizations): expose Clerk organization procedures"
```

### Task 6: Add organization management UI and end-to-end acceptance

**Files:**
- Create: `apps/web/modules/organizations/ClerkOrganizationSettings.tsx`
- Create: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/organizations/page.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx`
- Modify: `apps/web/modules/onboarding/components/onboarding-organization-browser-view.tsx`
- Modify: `apps/web/modules/onboarding/components/onboarding-invite-browser-view.tsx`
- Modify: `packages/i18n/locales/en/common.json`
- Create: `apps/web/playwright/auth/clerk-organizations.e2e.ts`

**Interfaces:**
- UI uses only `viewer.organizations.*`; Clerk provider calls stay server-side.
- Displays recoverable seat/billing errors without locally activating the member.

- [ ] **Step 1: Write browser acceptance for the complete membership lifecycle**

```ts
test("owner invites a member and role boundaries are enforced", async ({ page, users }) => {
  await users.owner.createOrganization("E2E Clerk Org");
  await users.owner.invite(users.member.email);
  await users.member.acceptInvitation();
  await expect(users.member.page.getByText("E2E Clerk Org")).toBeVisible();
  await expect(users.member.callOrganizationMutation("archive")).rejects.toMatchObject({ status: 403 });
});
```

Add create, invitation, acceptance, admin/member role change, owner invariant, removal, archive, duplicate webhook, and provider-retry cases.

- [ ] **Step 2: Implement the UI through tRPC**

Use existing onboarding forms and Convenio UI primitives. Add translations for organization creation, invitation status, roles, archive confirmation, read-only plan state, and billing-seat recovery.

- [ ] **Step 3: Run focused unit and browser tests**

```bash
TZ=UTC yarn test packages/features/organizations packages/trpc/server/routers/viewer/organizations apps/web/app/api/webhooks/clerk/route.test.ts
AUTH_PROVIDER=clerk PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/auth/clerk-organizations.e2e.ts --project=@calcom/web --workers=1
```

Expected: all service, route, authorization, and browser cases pass.

- [ ] **Step 4: Run the organization plan quality gate**

Run: `yarn biome check --write packages/features/organizations packages/trpc/server/routers/viewer/organizations apps/web/app/api/webhooks/clerk apps/web/modules/organizations packages/i18n/locales/en/common.json && yarn type-check:ci --force`

Expected: Biome and repository type check pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/organizations apps/web/app/'(use-page-wrapper)'/settings/'(settings-layout)'/organizations/page.tsx apps/web/app/'(use-page-wrapper)'/settings/'(settings-layout)'/SettingsLayoutAppDirClient.tsx apps/web/modules/onboarding/components/onboarding-organization-browser-view.tsx apps/web/modules/onboarding/components/onboarding-invite-browser-view.tsx apps/web/playwright/auth/clerk-organizations.e2e.ts packages/i18n/locales/en/common.json
git commit -m "feat(organizations): add Clerk organization management"
```
