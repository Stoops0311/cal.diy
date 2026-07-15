# Polar Billing and Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four Polar subscription products, a reliable local subscription projection, self-serve billing, and server-enforced Free/Pro/Team capabilities.

**Architecture:** Polar owns checkout, invoices, payment recovery, portal, trials, cancellation, and subscription lifecycle. Convenio stores a sanitized, timestamp-ordered projection keyed by a user or organization subject and computes all authorization from a code-defined entitlement matrix. Checkout redirects display pending state only; verified Polar customer-state events or explicit server reconciliation activate access.

**Tech Stack:** Polar TypeScript SDK, Next.js route handlers, tRPC, Prisma/PostgreSQL, TypeScript, Vitest, Playwright, Polar sandbox.

## Global Constraints

- Free: two active personal event types, one calendar, branding on, and no advanced event, booking payment, API key, outgoing webhook, or team capability.
- Pro: $10/month or $96/year, fourteen-day card-backed trial, unlimited personal resources, advanced/recurring/private/redirect/booking-field/payment capabilities, API keys, webhooks, and branding removal.
- Team: $15/accepted member/month or $144/accepted member/year, fourteen-day trial, one to fifty accepted members, all Pro capabilities plus organizations, roles, team events, collective/round-robin scheduling, and booking audit.
- Pending invitations do not consume seats; accepted membership count does.
- Downgrades never delete customer data; they block new/reactivated resources and make expired team data read-only.
- A checkout success redirect never grants access.
- Polar tokens, webhook secrets, and product IDs are server-only and never committed or logged.
- Use Polar product IDs from environment configuration and verify webhook metadata (`plan_key`, `billing_interval`) against that mapping.
- Use direct source imports, `import type`, Prisma `select`, translated strings, exhaustive types, and small reviewable commits.

---

## File Structure

- `packages/prisma/schema.prisma`: subject-keyed `BillingSubscription` projection and billing enums.
- `packages/prisma/migrations/20260715110000_add_polar_billing_projection/migration.sql`: additive billing tables/indexes.
- `packages/features/billing/lib/plans.ts`: product mapping and plan/interval/status types.
- `packages/features/billing/lib/entitlements.ts`: exhaustive plan capability matrix and snapshot computation.
- `packages/features/billing/services/PolarClient.ts`: server-only sandbox/production client configuration.
- `packages/features/billing/services/PolarSubscriptionProjectionService.ts`: timestamp-ordered customer-state projection.
- `packages/features/billing/services/PolarCheckoutService.ts`: checkout, portal, plan change, cancel, reconcile, and seat operations.
- `packages/features/billing/services/PolarSeatService.ts`: implements `OrganizationSeatBillingPort` from the organization plan.
- `apps/web/app/api/webhooks/polar/route.ts`: signature-first idempotent webhook ingestion.
- `packages/trpc/server/routers/viewer/billing/*`: authenticated billing procedures.
- `apps/web/modules/billing/*`: pricing, checkout-pending, subscription, and portal UI.
- Existing mutation handlers: authoritative entitlement enforcement.
- `scripts/provision-polar-sandbox.ts`: idempotent product/benefit/catalog provisioning.
- `apps/web/playwright/billing/polar-billing.e2e.ts`: checkout and lifecycle acceptance.
- `apps/web/playwright/billing/entitlements.e2e.ts`: UI and direct-mutation gates.

### Task 1: Add the subject-keyed billing projection

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260715110000_add_polar_billing_projection/migration.sql`
- Create: `packages/features/billing/services/PolarSubscriptionProjectionService.test.ts`

**Interfaces:**
- Types: `PlanKey = FREE | PRO | TEAM`, `BillingInterval = MONTH | YEAR`, `BillingStatus = NONE | TRIALING | ACTIVE | PAST_DUE | CANCELED | UNPAID`.
- Subject key format: `user:<localUserId>` or `organization:<localOrganizationId>`.
- Exactly one of `userId` and `organizationId` is non-null; `subjectKey` is unique.

- [ ] **Step 1: Write persistence and subject-invariant tests**

```ts
it("stores one subscription for a user subject", async () => {
  const subscription = await createBillingSubscription({ subjectKey: "user:7", userId: 7, organizationId: null });
  expect(subscription).toMatchObject({ plan: "FREE", status: "NONE", seatCount: 1 });
});

it("rejects a subscription with two subject relations", async () => {
  await expect(createBillingSubscription({ subjectKey: "user:7", userId: 7, organizationId: 9 })).rejects.toThrow();
});
```

- [ ] **Step 2: Run the test and confirm the model is absent**

Run: `TZ=UTC yarn test packages/features/billing/services/PolarSubscriptionProjectionService.test.ts`

Expected: FAIL on unknown Prisma model/types.

- [ ] **Step 3: Add enums, relations, model, indexes, and database check constraint**

```prisma
model BillingSubscription {
  id                       String          @id @default(uuid())
  subjectKey               String          @unique
  userId                   Int?            @unique
  user                     User?           @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId           Int?            @unique
  organization             Team?           @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  plan                     PlanKey         @default(FREE)
  interval                 BillingInterval?
  status                   BillingStatus   @default(NONE)
  polarCustomerId          String?          @unique
  polarSubscriptionId      String?          @unique
  polarProductId           String?
  seatCount                Int              @default(1)
  currentPeriodStart       DateTime?
  currentPeriodEnd         DateTime?
  cancelAtPeriodEnd        Boolean          @default(false)
  latestEffectiveAt        DateTime?
  providerModifiedAt       DateTime?
  createdAt                DateTime          @default(now())
  updatedAt                DateTime          @updatedAt
}
```

Add `billingSubscription BillingSubscription?` relations to `User` and `Team`. The SQL migration adds `CHECK (("userId" IS NOT NULL)::int + ("organizationId" IS NOT NULL)::int = 1)` and `CHECK ("seatCount" BETWEEN 1 AND 50)`.

- [ ] **Step 4: Generate and run tests**

Run: `yarn workspace @calcom/prisma generate-schemas && TZ=UTC yarn test packages/features/billing/services/PolarSubscriptionProjectionService.test.ts`

Expected: Prisma generation and persistence tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/20260715110000_add_polar_billing_projection/migration.sql packages/features/billing/services/PolarSubscriptionProjectionService.test.ts
git commit -m "feat(billing): add Polar subscription projection"
```

### Task 2: Define plans and exhaustive entitlement snapshots

**Files:**
- Create: `packages/features/billing/lib/plans.ts`
- Create: `packages/features/billing/lib/entitlements.ts`
- Create: `packages/features/billing/lib/entitlements.test.ts`

**Interfaces:**
- Produces: `EntitlementSnapshot` with boolean capabilities and `limits.activePersonalEventTypes`, `limits.connectedCalendars`, `limits.acceptedOrganizationMembers`.
- Produces: `getEntitlements(subscription, now): EntitlementSnapshot`, `assertEntitled(snapshot, capability): void`, and `assertWithinLimit(snapshot, resource, currentCount): void`.
- Grace rule: `PAST_DUE` retains capabilities until `currentPeriodEnd + 7 days`; `UNPAID` never does.

- [ ] **Step 1: Write a table-driven plan matrix test**

```ts
it.each([
  ["FREE", 2, 1, false, false, true],
  ["PRO", Infinity, Infinity, true, false, false],
  ["TEAM", Infinity, Infinity, true, true, false],
] as const)("computes %s capabilities", (plan, events, calendars, apiKeys, organizations, branding) => {
  const snapshot = getEntitlements(activeSubscription(plan), now);
  expect(snapshot).toMatchObject({
    limits: { activePersonalEventTypes: events, connectedCalendars: calendars },
    canCreateApiKeys: apiKeys,
    canManageOrganizations: organizations,
    showBranding: branding,
  });
});
```

Add every capability from the design, all statuses, grace expiration, period-end cancellation, and organization Team inheritance.

- [ ] **Step 2: Run and confirm the modules are absent**

Run: `TZ=UTC yarn test packages/features/billing/lib/entitlements.test.ts`

Expected: FAIL because the matrix is missing.

- [ ] **Step 3: Implement one exhaustive `satisfies` matrix**

```ts
export const PLAN_ENTITLEMENTS = {
  FREE: { activePersonalEventTypes: 2, connectedCalendars: 1, acceptedOrganizationMembers: 0, canUseAdvancedEvents: false, canRemoveBranding: false, canUseBookingPayments: false, canCreateApiKeys: false, canCreateWebhooks: false, canManageOrganizations: false, canCreateTeamEvents: false, canUseCollectiveScheduling: false, canUseRoundRobinScheduling: false, canReadBookingAudit: false },
  PRO: { activePersonalEventTypes: Infinity, connectedCalendars: Infinity, acceptedOrganizationMembers: 0, canUseAdvancedEvents: true, canRemoveBranding: true, canUseBookingPayments: true, canCreateApiKeys: true, canCreateWebhooks: true, canManageOrganizations: false, canCreateTeamEvents: false, canUseCollectiveScheduling: false, canUseRoundRobinScheduling: false, canReadBookingAudit: false },
  TEAM: { activePersonalEventTypes: Infinity, connectedCalendars: Infinity, acceptedOrganizationMembers: 50, canUseAdvancedEvents: true, canRemoveBranding: true, canUseBookingPayments: true, canCreateApiKeys: true, canCreateWebhooks: true, canManageOrganizations: true, canCreateTeamEvents: true, canUseCollectiveScheduling: true, canUseRoundRobinScheduling: true, canReadBookingAudit: true },
} as const satisfies Record<PlanKey, PlanEntitlements>;
```

- [ ] **Step 4: Run tests and type check the feature package**

Run: `TZ=UTC yarn test packages/features/billing/lib/entitlements.test.ts && yarn workspace @calcom/features type-check`

Expected: matrix and lifecycle tests pass; exhaustive typing prevents omitted capabilities.

- [ ] **Step 5: Commit**

```bash
git add packages/features/billing/lib/plans.ts packages/features/billing/lib/entitlements.ts packages/features/billing/lib/entitlements.test.ts
git commit -m "feat(billing): define Convenio entitlements"
```

### Task 3: Configure the Polar client and product mapping

**Files:**
- Modify: `packages/features/package.json`
- Modify: `yarn.lock`
- Create: `packages/features/billing/services/PolarClient.ts`
- Create: `packages/features/billing/services/PolarClient.test.ts`

**Interfaces:**
- Environment: `POLAR_SERVER`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_MONTHLY_PRODUCT_ID`, `POLAR_PRO_ANNUAL_PRODUCT_ID`, `POLAR_TEAM_MONTHLY_PRODUCT_ID`, `POLAR_TEAM_ANNUAL_PRODUCT_ID`.
- Produces: `getPolarClient()`, `getPolarProduct(plan, interval)`, `resolveConfiguredPolarProduct(productId, metadata)`.
- `POLAR_SERVER` accepts `sandbox` or `production`; sandbox is required until acceptance passes.

- [ ] **Step 1: Write complete/missing/mismatched configuration tests**

Assert every plan/interval combination resolves, duplicate IDs fail startup, a Team webhook cannot carry Pro metadata, public environment access is absent, and production rejects product IDs equal to sandbox fixtures.

- [ ] **Step 2: Run and confirm configuration is missing**

Run: `TZ=UTC yarn test packages/features/billing/services/PolarClient.test.ts`

Expected: FAIL because the client module is absent.

- [ ] **Step 3: Add `@polar-sh/sdk` and server-only validation**

Instantiate the SDK with the selected server and access token. Parse product IDs into a typed record keyed by `PRO:MONTH`, `PRO:YEAR`, `TEAM:MONTH`, and `TEAM:YEAR`. Throw before serving billing requests when any value is missing or duplicated.

- [ ] **Step 4: Run tests and package type checks**

Run: `TZ=UTC yarn test packages/features/billing/services/PolarClient.test.ts && yarn workspace @calcom/features type-check`

Expected: validation tests and package type check pass.

- [ ] **Step 5: Commit**

```bash
git add packages/features/package.json packages/features/billing/services/PolarClient.ts packages/features/billing/services/PolarClient.test.ts yarn.lock
git commit -m "feat(billing): configure Polar SDK"
```

### Task 4: Project timestamp-ordered Polar customer state

**Files:**
- Create: `packages/features/billing/services/PolarSubscriptionProjectionService.ts`
- Modify: `packages/features/billing/services/PolarSubscriptionProjectionService.test.ts`

**Interfaces:**
- Consumes: sanitized `PolarCustomerStateSnapshot { eventId; effectiveAt; externalCustomerId; customerId; subscriptionId; productId; productMetadata; status; seats; currentPeriodStart; currentPeriodEnd; cancelAtPeriodEnd; activeBenefits }`.
- Produces: `projectCustomerState(snapshot): Promise<{ applied: boolean; subscription: BillingSubscription }>`.
- External IDs: `user:<clerkUserId>` and `org:<clerkOrganizationId>`; local `subjectKey` remains numeric.

- [ ] **Step 1: Add lifecycle, subject, metadata, and ordering tests**

Cover trialing, active, past-due grace, canceled with retained benefit, unpaid/revoked, all four products, invalid product/metadata, unknown external subject, duplicate, and an older event arriving after a newer event.

```ts
it("does not let an older event overwrite newer state", async () => {
  await service.projectCustomerState(snapshot({ effectiveAt: new Date("2026-07-15T12:00:00Z"), status: "active" }));
  const result = await service.projectCustomerState(snapshot({ effectiveAt: new Date("2026-07-15T11:00:00Z"), status: "canceled" }));
  expect(result.applied).toBe(false);
  expect(result.subscription.status).toBe("ACTIVE");
});
```

- [ ] **Step 2: Run tests and confirm projection behavior is missing**

Run: `TZ=UTC yarn test packages/features/billing/services/PolarSubscriptionProjectionService.test.ts`

Expected: lifecycle and ordering cases fail.

- [ ] **Step 3: Implement subject resolution and monotonic upsert**

Resolve external user/org IDs through unique Clerk mappings. Verify configured product ID and metadata. In one transaction, lock/read the projection, ignore `effectiveAt <= latestEffectiveAt` unless it repairs a missing provider identifier, then update normalized fields. A revoked benefit yields `FREE/NONE` for the subject without deleting the projection row.

- [ ] **Step 4: Run projection and entitlement tests**

Run: `TZ=UTC yarn test packages/features/billing/services/PolarSubscriptionProjectionService.test.ts packages/features/billing/lib/entitlements.test.ts`

Expected: all state transitions and entitlement results pass.

- [ ] **Step 5: Commit**

```bash
git add packages/features/billing/services/PolarSubscriptionProjectionService.ts packages/features/billing/services/PolarSubscriptionProjectionService.test.ts
git commit -m "feat(billing): project Polar customer state"
```

### Task 5: Verify and ingest Polar webhooks

**Files:**
- Create: `apps/web/app/api/webhooks/polar/route.ts`
- Create: `apps/web/app/api/webhooks/polar/route.test.ts`
- Create: `packages/features/billing/services/PolarWebhookService.ts`
- Create: `packages/features/billing/services/PolarWebhookService.test.ts`

**Interfaces:**
- Endpoint: `POST /api/webhooks/polar`.
- Primary event: `customer.state_changed`; safely acknowledge unrelated configured events after recording their type.
- Event ledger provider: `POLAR`.

- [ ] **Step 1: Write signature, duplicate, retry, hash, and dispatch tests**

```ts
it("never projects an invalid signature", async () => {
  const response = await POST(requestWithHeaders(rawBody, invalidHeaders));
  expect(response.status).toBe(401);
  expect(projectCustomerState).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm the webhook route is missing**

Run: `TZ=UTC yarn test apps/web/app/api/webhooks/polar/route.test.ts packages/features/billing/services/PolarWebhookService.test.ts`

Expected: FAIL because handler/service modules are absent.

- [ ] **Step 3: Implement signature-first idempotent processing**

Use Polar's supported webhook validation helper with the raw body and signing secret. Claim the external event ID in `ExternalWebhookEvent`, store only SHA-256 and sanitized metadata, dispatch `customer.state_changed`, and mark success or failure. Return success for a duplicate that already succeeded; allow an explicit replay command for failed events.

- [ ] **Step 4: Run webhook, projection, and out-of-order tests**

Run: `TZ=UTC yarn test apps/web/app/api/webhooks/polar/route.test.ts packages/features/billing/services/PolarWebhookService.test.ts packages/features/billing/services/PolarSubscriptionProjectionService.test.ts`

Expected: all safety and lifecycle cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/webhooks/polar/route.ts apps/web/app/api/webhooks/polar/route.test.ts packages/features/billing/services/PolarWebhookService.ts packages/features/billing/services/PolarWebhookService.test.ts
git commit -m "feat(billing): process Polar customer state"
```

### Task 6: Implement checkout, portal, plan changes, cancellation, reconciliation, and seats

**Files:**
- Create: `packages/features/billing/services/PolarCheckoutService.ts`
- Create: `packages/features/billing/services/PolarCheckoutService.test.ts`
- Create: `packages/features/billing/services/PolarSeatService.ts`
- Create: `packages/features/billing/services/PolarSeatService.test.ts`

**Interfaces:**
- Produces: `createCheckout(actorUserId, { plan, interval, organizationId? }): Promise<{ checkoutUrl: string }>`.
- Produces: `createPortalSession`, `changePlan`, `cancelAtPeriodEnd`, `reconcile`; `PolarSeatService.syncAcceptedSeats` implements `OrganizationSeatBillingPort`.
- Checkout success: `/settings/billing?checkout_id={CHECKOUT_ID}`; return: `/pricing`.
- Polar external customer IDs: `user:<clerkUserId>` for Pro and `org:<clerkOrganizationId>` for Team.

- [ ] **Step 1: Write authorization, payload, and seat-ordering tests**

Cover four product selections, Pro rejecting org subject, Team requiring owner/admin, 1–50 accepted seats, pending invitation exclusion, metadata, success/return URLs, no redirect activation, portal ownership, app-owned plan change, period-end cancellation, reconciliation by external customer ID, serialized seat updates, and provider failure.

- [ ] **Step 2: Run and confirm service modules are absent**

Run: `TZ=UTC yarn test packages/features/billing/services/PolarCheckoutService.test.ts packages/features/billing/services/PolarSeatService.test.ts`

Expected: FAIL because services are missing.

- [ ] **Step 3: Implement server-owned Polar operations**

Use the SDK checkout create API with one configured product, external customer ID, seats for Team, and subject metadata. Use `customerSessions.create({ externalCustomerId, returnUrl })` for portal URLs. For plan/seat changes, fetch current provider state, authorize the local subject, send the provider update with an idempotency key, then reconcile customer state. Never mutate the local projection optimistically.

- [ ] **Step 4: Run service tests**

Run: `TZ=UTC yarn test packages/features/billing/services/PolarCheckoutService.test.ts packages/features/billing/services/PolarSeatService.test.ts`

Expected: payload, authorization, reconciliation, and seat serialization tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/features/billing/services/PolarCheckoutService.ts packages/features/billing/services/PolarCheckoutService.test.ts packages/features/billing/services/PolarSeatService.ts packages/features/billing/services/PolarSeatService.test.ts
git commit -m "feat(billing): add Polar subscription commands"
```

### Task 7: Expose billing procedures and subscription UI

**Files:**
- Create: `packages/trpc/server/routers/viewer/billing/_router.ts`
- Create: `packages/trpc/server/routers/viewer/billing/billing.schema.ts`
- Create: `packages/trpc/server/routers/viewer/billing/billing.handler.ts`
- Create: `packages/trpc/server/routers/viewer/billing/billing.handler.test.ts`
- Modify: `packages/trpc/server/routers/viewer/_router.tsx`
- Create: `apps/web/modules/billing/BillingSettings.tsx`
- Create: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/billing/page.tsx`
- Create: `apps/web/app/(use-page-wrapper)/pricing/page.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/upgrade/page.tsx`
- Modify: `apps/web/modules/upgrade/upgrade-view.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx`
- Modify: `packages/i18n/locales/en/common.json`

**Interfaces:**
- Procedures: `viewer.billing.get`, `createCheckout`, `createPortalSession`, `changePlan`, `cancelAtPeriodEnd`, `reconcile`.
- Billing page polls `get` after checkout and labels projection as pending until a verified event/reconcile updates it.

- [ ] **Step 1: Write handler authorization and input tests**

Assert anonymous denial, configured plan/interval only, personal Pro, organization Team admin/owner, organization member denial, external URL validation, and reconcile rate limiting.

- [ ] **Step 2: Run handler tests**

Run: `TZ=UTC yarn test packages/trpc/server/routers/viewer/billing/billing.handler.test.ts`

Expected: FAIL because router and handlers are missing.

- [ ] **Step 3: Implement schemas, thin handlers, and router registration**

Use Zod enums for plan/interval and numeric organization ID. Handlers call services, translate `ErrorWithCode` at the tRPC boundary, and return only sanitized projection fields and same-origin/provider HTTPS URLs.

- [ ] **Step 4: Implement pricing and billing state UI**

Show Free/Pro/Team comparisons, monthly/annual prices, trial copy, accepted-seat pricing, current plan/status/renewal, pending checkout, portal link, app-owned plan changes, and period-end cancellation. Add all copy to English translations.

- [ ] **Step 5: Run handler tests, Biome, and web type check**

Run: `TZ=UTC yarn test packages/trpc/server/routers/viewer/billing/billing.handler.test.ts && yarn biome check --write packages/trpc/server/routers/viewer/billing apps/web/modules/billing apps/web/modules/upgrade packages/i18n/locales/en/common.json && yarn workspace @calcom/web type-check`

Expected: tests, formatting, and type check pass.

- [ ] **Step 6: Commit in two reviewable slices**

```bash
git add packages/trpc/server/routers/viewer/billing packages/trpc/server/routers/viewer/_router.tsx
git commit -m "feat(billing): expose subscription procedures"
git add apps/web/modules/billing apps/web/app/'(use-page-wrapper)'/settings/'(settings-layout)'/billing/page.tsx apps/web/app/'(use-page-wrapper)'/pricing/page.tsx apps/web/app/'(use-page-wrapper)'/upgrade/page.tsx apps/web/modules/upgrade/upgrade-view.tsx apps/web/app/'(use-page-wrapper)'/settings/'(settings-layout)'/SettingsLayoutAppDirClient.tsx packages/i18n/locales/en/common.json
git commit -m "feat(billing): add subscription management UI"
```

### Task 8: Enforce entitlements at server mutation boundaries

**Files:**
- Modify: `packages/trpc/server/routers/viewer/eventTypes/heavy/create.handler.ts`
- Modify: `packages/trpc/server/routers/viewer/eventTypes/heavy/update.handler.ts`
- Modify: `packages/trpc/server/routers/viewer/me/updateProfile.handler.ts`
- Modify: `packages/trpc/server/routers/viewer/apiKeys/create.handler.ts`
- Modify: `packages/trpc/server/routers/viewer/webhook/create.handler.ts`
- Modify: `packages/features/selectedCalendar/repositories/SelectedCalendarRepository.ts`
- Modify: `packages/features/credentials/repositories/CredentialRepository.ts`
- Modify: `packages/features/profile/lib/hideBranding.ts`
- Modify: `packages/features/bookings/services/BookingAccessService.ts`
- Create: `packages/features/billing/services/EntitlementService.ts`
- Create: `packages/features/billing/services/EntitlementService.test.ts`
- Add focused tests beside each modified handler/service.

**Interfaces:**
- Produces: `EntitlementService.forUser(userId)` and `.forOrganization(organizationId)` returning one immutable snapshot.
- Throws `ErrorWithCode("PLAN_LIMIT_REACHED")` or `ErrorWithCode("PLAN_UPGRADE_REQUIRED")` before a write.

- [ ] **Step 1: Add direct-mutation tests for every gate**

Test Free third event creation/reactivation, second calendar connection, advanced/recurring/private/redirect/booking-field/payment settings, branding removal, API-key creation, webhook creation, second provisional organization creation, provisional organization invite/member activation, team event creation, collective/round-robin selection, and booking-audit read. Verify that the first owner-only provisional organization can be created for Team checkout while every other team capability remains denied. Test Pro success for personal gates and denial for team gates; Team success for all included gates.

- [ ] **Step 2: Implement the read-only entitlement service**

Fetch the user's personal projection and applicable accepted organization Team projection with Prisma `select`, apply grace/status rules, and return a frozen snapshot. Count active event types, connected calendar credentials, and accepted members in the service layer.

- [ ] **Step 3: Add checks immediately before mutation business logic**

Handlers/services obtain one snapshot, assert the capability/limit, then execute existing behavior. Repositories remain persistence-only; if the only mutation seam is currently a repository, move the check to its calling service/handler rather than adding business logic to the repository.

- [ ] **Step 4: Make downgrade behavior non-destructive**

Force branding on at render time when `showBranding` is true, block new/reactivated over-limit resources without disabling existing ones, make expired Team administration/event mutations read-only, return a plan-inactive state from team booking pages, and leave personal scheduling unchanged.

- [ ] **Step 5: Run the full entitlement unit/integration suite**

Run: `TZ=UTC yarn test packages/features/billing packages/trpc/server/routers/viewer/eventTypes packages/trpc/server/routers/viewer/apiKeys packages/trpc/server/routers/viewer/webhook packages/features/profile/lib/hideBranding.test.ts packages/features/bookings/services/BookingAccessService.test.ts`

Expected: direct mutations fail/succeed according to Free/Pro/Team, including downgrade and grace cases.

- [ ] **Step 6: Commit each enforcement family separately**

Use conventional commits `feat(entitlements): enforce personal resource limits`, `feat(entitlements): gate developer and branding features`, and `feat(entitlements): gate team scheduling`; each commit remains under the repository limits.

### Task 9: Provision the Polar sandbox catalog idempotently

**Files:**
- Create: `scripts/provision-polar-sandbox.ts`
- Create: `scripts/provision-polar-sandbox.test.ts`
- Modify: `package.json`
- Create: `docs/billing/polar-sandbox-runbook.md`

**Interfaces:**
- CLI: `yarn polar:provision-sandbox --dry-run` and `--apply`.
- Creates/updates benefits `convenio-pro`, `convenio-team` and four recurring products with exact names/prices/metadata.
- Prints resulting product IDs only; access tokens and webhook secrets are never printed.

- [ ] **Step 1: Write desired-catalog and idempotency tests**

Assert exact USD prices in cents (`1000`, `9600`, `1500`, `14400`), monthly/yearly intervals, fourteen-day trials, benefit attachment, metadata, Team seat range 1–50, second-run no-op, and conflicting product refusal.

- [ ] **Step 2: Run and confirm provisioning code is absent**

Run: `TZ=UTC yarn test scripts/provision-polar-sandbox.test.ts`

Expected: FAIL because the script is missing.

- [ ] **Step 3: Implement dry-run/apply against the sandbox organization**

List current benefits/products, compare stable names and metadata, create missing objects, update safe mutable fields, and stop on incompatible price/product collisions. Write the server-only product IDs to the local secret store manually through the dashboard/CLI workflow, never to tracked files.

- [ ] **Step 4: Run tests, dry-run, apply, and second dry-run**

```bash
TZ=UTC yarn test scripts/provision-polar-sandbox.test.ts
yarn polar:provision-sandbox --dry-run
yarn polar:provision-sandbox --apply
yarn polar:provision-sandbox --dry-run
```

Expected: tests pass; apply creates exactly four products/two benefits; final dry run reports no changes.

- [ ] **Step 5: Document dashboard-only settings and evidence**

Record how to verify USD, multiple subscriptions off, seven-day revocation grace, trial-abuse prevention, portal plan/seat editing off, period-end cancellation on, least-privilege token, and webhook endpoint. Record object IDs but no secrets.

- [ ] **Step 6: Commit**

```bash
git add scripts/provision-polar-sandbox.ts scripts/provision-polar-sandbox.test.ts package.json docs/billing/polar-sandbox-runbook.md
git commit -m "chore(billing): provision Polar sandbox catalog"
```

### Task 10: Prove billing lifecycle and entitlement boundaries end to end

**Files:**
- Create: `apps/web/playwright/billing/polar-billing.e2e.ts`
- Create: `apps/web/playwright/billing/entitlements.e2e.ts`
- Create: `apps/web/playwright/fixtures/polar.ts`

**Interfaces:**
- Checkout card: `4242 4242 4242 4242`, future expiry, arbitrary CVC.
- Tests tag all external/local fixtures with a unique run ID and clean them on success or failure.

- [ ] **Step 1: Implement all-four-product checkout scenarios**

For Pro monthly/annual and Team monthly/annual: initiate checkout, complete sandbox payment, assert redirect remains pending before webhook projection, wait for verified projection, then assert plan/interval/status/product/seat fields and UI capability activation.

- [ ] **Step 2: Implement lifecycle scenarios**

Cover personal-Pro/organization-Team subject isolation, accepted member seat increase, member removal/decrement, portal URL/invoice/payment-method visibility, period-end cancellation, paid-period retention, benefit revocation, delayed webhook plus reconcile, invalid signature, duplicate, and out-of-order delivery.

- [ ] **Step 3: Implement direct mutation entitlement scenarios**

Call tRPC/API mutations without UI for every Free/Pro/Team gate and assert stable error codes and unchanged database state on denial. Also assert downgrade resources remain present and Team booking pages become plan-inactive.

- [ ] **Step 4: Run the billing plan verification gate**

```bash
TZ=UTC yarn test packages/features/billing packages/trpc/server/routers/viewer/billing apps/web/app/api/webhooks/polar/route.test.ts scripts/provision-polar-sandbox.test.ts
yarn type-check:ci --force
AUTH_PROVIDER=clerk PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/billing/polar-billing.e2e.ts apps/web/playwright/billing/entitlements.e2e.ts --project=@calcom/web --workers=1
```

Expected: all unit, integration, type, checkout, lifecycle, and feature-gate cases pass; traces/screenshots are retained at auth, checkout, projection, and entitlement transitions.

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright/billing apps/web/playwright/fixtures/polar.ts
git commit -m "test(billing): cover Polar subscriptions and entitlements"
```
