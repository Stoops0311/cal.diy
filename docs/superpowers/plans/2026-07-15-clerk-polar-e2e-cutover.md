# Clerk and Polar End-to-End Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision the Clerk and Polar dashboards, prove every identity/organization/billing/entitlement flow against real sandbox services, rehearse rollback, stage production enablement, and remove legacy NextAuth ownership after the stability gate.

**Architecture:** Dashboard configuration is treated as testable infrastructure: desired-state runbooks, object inventories, and screenshots provide evidence without storing secrets. One serial Playwright acceptance project creates tagged Clerk, Polar, and local fixtures, exercises the complete browser and direct-API matrix, captures transitions, and cleans up in `finally`/global teardown. Cutover is staged behind `AUTH_PROVIDER`, with explicit rollback and a separately reviewed cleanup only after thirty stable production days.

**Tech Stack:** Clerk Dashboard and testing tokens, Polar sandbox, Playwright, PostgreSQL/Prisma assertions, Next.js, Vercel/local secret stores, Vitest, Biome.

## Global Constraints

- Do not modify or delete the existing unrelated Clerk applications `Nuncia` or `Procura`; create a separate `Convenio` application.
- Configure and accept the Clerk development instance before creating/configuring production.
- Use the existing Polar sandbox organization `Convenio`; keep production Polar identifiers completely separate.
- Never commit, print, screenshot, or document secret values; screenshots must exclude token/secret reveal surfaces.
- Automated Clerk emails use a unique `+clerk_test` address and code `424242` under supported test mode.
- Polar checkout uses sandbox card `4242 4242 4242 4242`, a future expiration, and arbitrary CVC.
- Run external-service browser tests serially with one worker and unique run IDs.
- Cleanup executes on both pass and failure and never deletes untagged users, organizations, customers, or subscriptions.
- Do not remove NextAuth or local password/MFA ownership before thirty consecutive stable production days and a successful rollback rehearsal.

---

## File Structure

- `docs/auth/clerk-dashboard-runbook.md`: exact desired Clerk development/production settings and evidence checklist.
- `docs/billing/polar-sandbox-runbook.md`: exact desired Polar catalog/organization/portal/webhook settings.
- `docs/cutover/clerk-polar-acceptance.md`: requirement-to-evidence ledger and run IDs.
- `apps/web/playwright/clerk-polar/global.setup.ts`: testing token/configuration validation.
- `apps/web/playwright/clerk-polar/fixtures.ts`: tagged Clerk/Polar/database fixtures and cleanup.
- `apps/web/playwright/clerk-polar/full-acceptance.e2e.ts`: ordered full-story acceptance.
- `playwright.config.ts`: serial Clerk/Polar project, traces, screenshots, and HTML report.
- `scripts/reconcile-clerk-polar.ts`: administrative identity/org/billing drift detection and repair.
- `scripts/cleanup-clerk-polar-e2e.ts`: tagged external/local cleanup.
- `docs/cutover/clerk-polar-rollout.md`: staging/production enablement, monitoring, rollback, and cleanup gates.
- Legacy auth files/dependencies: removed only in the final cleanup task after dated evidence.

### Task 1: Provision the Clerk development application

**Files:**
- Create: `docs/auth/clerk-dashboard-runbook.md`
- Create: `docs/cutover/evidence/.gitkeep`

**Interfaces:**
- Clerk application name: `Convenio`.
- Required development settings: email/password, email-code verification required, unique username required, Google, Microsoft, TOTP, backup codes, Organizations, `org:admin`, `org:member`, Clerk Billing off.
- Convenio routes: sign-in `/auth/login`, sign-up `/signup`, post-sign-in `/event-types`, post-sign-up `/getting-started`.

- [ ] **Step 1: Inventory the Clerk workspace before mutation**

Record application names and IDs in the runbook, explicitly marking `Nuncia` and `Procura` as protected/untouched. Do not reveal any keys. Capture a screenshot of the non-secret application list in `docs/cutover/evidence/clerk-app-list.png`.

- [ ] **Step 2: Create or reuse only the exact `Convenio` application**

If no application named exactly `Convenio` exists, create it. If one exists, inspect its application ID and settings and reconcile it; never create a duplicate. Record the non-secret development instance/application IDs.

- [ ] **Step 3: Configure authentication and security settings**

Enable email/password; require email-code verification and unique username; enable Google/Microsoft identity providers; enable TOTP and backup codes; disable Clerk Billing. Verify that OAuth redirect origins target Convenio and do not replace calendar integration credentials.

- [ ] **Step 4: Configure Organizations and roles**

Enable Organizations. Keep built-in `org:admin` and `org:member`; do not add custom roles, enterprise connections, domains, SSO, SCIM, or directory sync.

- [ ] **Step 5: Configure application URLs and local secrets**

Set development home/sign-in/sign-up/after-auth URLs. Store publishable key, secret key, and webhook secret in the local/deployment secret store used by the app; confirm `git status` shows no tracked secret file.

- [ ] **Step 6: Add non-secret evidence and commit the runbook**

The runbook records each setting, dashboard location, verification date, application/instance IDs, and screenshot filename. Redact keys/tokens and avoid secret reveal dialogs.

```bash
git add docs/auth/clerk-dashboard-runbook.md docs/cutover/evidence/.gitkeep docs/cutover/evidence/clerk-app-list.png
git commit -m "docs(auth): record Clerk dashboard configuration"
```

### Task 2: Provision the Polar sandbox organization

**Files:**
- Modify: `docs/billing/polar-sandbox-runbook.md`
- Add non-secret screenshots under: `docs/cutover/evidence/`

**Interfaces:**
- Organization: existing sandbox `Convenio`.
- Products: `Convenio Pro — Monthly`, `Convenio Pro — Annual`, `Convenio Team — Monthly`, `Convenio Team — Annual`.
- Benefits: `convenio-pro`, `convenio-team`.
- Webhook URL: deployed/local tunnel origin plus `/api/webhooks/polar`.

- [ ] **Step 1: Inventory current sandbox objects**

Record organization ID, products, benefits, webhook endpoints, and token names without values. Confirm the provisioning script's dry run matches the dashboard inventory.

- [ ] **Step 2: Run idempotent catalog provisioning**

Run: `yarn polar:provision-sandbox --apply && yarn polar:provision-sandbox --dry-run`

Expected: exactly four products and two benefits exist; the final dry run reports no changes.

- [ ] **Step 3: Configure organization and portal behavior**

Set USD default, multiple active subscriptions off, seven-day benefit-revocation grace, trial-abuse prevention on, portal plan switching off, portal seat editing off, and period-end cancellation on. Confirm trials are card-backed and fourteen days on all four products.

- [ ] **Step 4: Create least-privilege token and webhook**

Create a named sandbox organization access token scoped only to required customer/checkout/subscription/product reads and writes. Create a webhook for `customer.state_changed`. Store the token/signing secret in the secret store; never paste values into the runbook or terminal output.

- [ ] **Step 5: Store server-only product IDs and verify the application mapping**

Set all four `POLAR_*_PRODUCT_ID` values in the local/deployment secret store. Run the `PolarClient` configuration test and confirm the application rejects a deliberately swapped metadata fixture.

- [ ] **Step 6: Capture non-secret evidence and commit**

Capture product list, benefit list, portal settings, and webhook delivery-list screenshots with secret controls absent. Update the runbook with non-secret IDs and verification date.

```bash
git add docs/billing/polar-sandbox-runbook.md docs/cutover/evidence/polar-products.png docs/cutover/evidence/polar-benefits.png docs/cutover/evidence/polar-webhook.png
git commit -m "docs(billing): record Polar sandbox configuration"
```

### Task 3: Build tagged external-service fixtures and cleanup

**Files:**
- Create: `apps/web/playwright/clerk-polar/fixtures.ts`
- Create: `apps/web/playwright/clerk-polar/fixtures.test.ts`
- Create: `scripts/cleanup-clerk-polar-e2e.ts`
- Create: `scripts/cleanup-clerk-polar-e2e.test.ts`
- Modify: `package.json`

**Interfaces:**
- Run tag: `convenio-e2e-<UTC timestamp>-<random suffix>`.
- Clerk user email: `convenio+clerk_test+<run tag>@example.com` or Clerk-supported equivalent.
- Every external object's public metadata contains the exact run tag.
- Cleanup requires an exact run tag and refuses untagged objects.

- [ ] **Step 1: Write fixture ownership and cleanup safety tests**

```ts
it("refuses to delete an untagged Clerk user", async () => {
  await expect(cleanup({ runTag, clerkUser: { publicMetadata: {} } })).rejects.toMatchObject({ code: "E2E_TAG_MISMATCH" });
});
```

Cover user, org, membership, Polar customer/subscription, and local DB records; cover partial setup and repeated cleanup.

- [ ] **Step 2: Run tests and confirm fixture helpers are absent**

Run: `TZ=UTC yarn test apps/web/playwright/clerk-polar/fixtures.test.ts scripts/cleanup-clerk-polar-e2e.test.ts`

Expected: FAIL because helpers are missing.

- [ ] **Step 3: Implement fixture creation and `finally` cleanup**

Use Clerk and Polar server SDKs only from Node test code. Track created IDs in memory and a gitignored run manifest containing IDs but no secrets. Cleanup subscriptions before customers/orgs/users, then local projections/memberships/test users. Verify tags immediately before every destructive call.

- [ ] **Step 4: Run fixture tests and a create/cleanup smoke test**

Run: `TZ=UTC yarn test apps/web/playwright/clerk-polar/fixtures.test.ts scripts/cleanup-clerk-polar-e2e.test.ts && yarn clerk-polar:e2e-cleanup --run-tag convenio-e2e-smoke-20260715`

Expected: unit tests pass; cleanup is a successful no-op when no tagged objects exist.

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright/clerk-polar/fixtures.ts apps/web/playwright/clerk-polar/fixtures.test.ts scripts/cleanup-clerk-polar-e2e.ts scripts/cleanup-clerk-polar-e2e.test.ts package.json
git commit -m "test(e2e): add safe Clerk and Polar fixtures"
```

### Task 4: Add one serial full-story Playwright project

**Files:**
- Modify: `playwright.config.ts`
- Create: `apps/web/playwright/clerk-polar/global.setup.ts`
- Create: `apps/web/playwright/clerk-polar/full-acceptance.e2e.ts`
- Create: `apps/web/playwright/clerk-polar/databaseAssertions.ts`

**Interfaces:**
- Project name: `@calcom/clerk-polar`.
- `workers: 1`, `fullyParallel: false`, HTML report, trace on first retry, transition screenshots, video on failure.
- Required secrets are validated by name only; missing configuration skips nothing and fails setup with a list of missing variable names.

- [ ] **Step 1: Add setup validation and the serial project**

Global setup calls Clerk testing-token setup supported by `@clerk/testing`, validates database and Polar sandbox reachability, and confirms product mapping. It never prints environment values.

- [ ] **Step 2: Implement ordered identity scenarios**

Test new email/password signup, `424242` verification, required username, local provisioning, logout, protected redirect, password login, session persistence, forgotten password, TOTP enrollment/recovery, migrated bcrypt login with unchanged password, Google linking, and Microsoft linking without duplicate local users.

- [ ] **Step 3: Implement ordered organization scenarios**

Test organization creation, invitation, acceptance, accepted-seat count, admin/member role updates, direct unauthorized mutation denial, last-owner protection, removal, and archive behavior.

- [ ] **Step 4: Implement ordered billing scenarios**

Test checkout for Pro monthly/annual and Team monthly/annual with sandbox card; pending redirect; verified projection; Pro-to-Team; seat increase/decrease; portal access; invoices/payment method visibility; period-end cancellation; paid-period retention; benefit removal/revocation.

- [ ] **Step 5: Implement resilience and entitlement scenarios**

Test invalid Clerk/Polar signatures, duplicate delivery, out-of-order lifecycle events, delayed delivery plus reconciliation, Free/Pro/Team UI and direct-mutation gates, non-destructive downgrade, Team plan-inactive booking, and personal scheduling continuity.

- [ ] **Step 6: Add database assertions and unconditional cleanup**

After every transition, use Prisma `select` to assert one local user, correct external mappings, one active subject projection, exact plan/interval/status/seats, and unchanged resources after denial/downgrade. Wrap the suite in tagged fixture teardown even after failure.

- [ ] **Step 7: Run the complete acceptance project**

Run: `AUTH_PROVIDER=clerk NEXT_PUBLIC_IS_E2E=1 PLAYWRIGHT_HEADLESS=1 yarn playwright test --project=@calcom/clerk-polar --workers=1`

Expected: all scenarios pass; HTML report, traces on retry/failure, videos on failure, and transition screenshots are present; teardown reports zero tagged objects remaining.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts apps/web/playwright/clerk-polar/global.setup.ts apps/web/playwright/clerk-polar/full-acceptance.e2e.ts apps/web/playwright/clerk-polar/databaseAssertions.ts
git commit -m "test(e2e): cover Clerk and Polar full story"
```

### Task 5: Add drift reconciliation and operational evidence

**Files:**
- Create: `scripts/reconcile-clerk-polar.ts`
- Create: `scripts/reconcile-clerk-polar.test.ts`
- Modify: `package.json`
- Create: `docs/cutover/clerk-polar-acceptance.md`

**Interfaces:**
- CLI: `yarn clerk-polar:reconcile --dry-run` and `--apply`; optional exact `--user-id` or `--organization-id` scope.
- Reports identity mapping, organization membership/role, accepted seats, customer external ID, product mapping, subscription status, and entitlement drift using counts/IDs only.

- [ ] **Step 1: Write drift detection and repair tests**

Cover missing Clerk mapping, missing local org, role drift, stale accepted membership, Polar seat drift, stale/out-of-order projection, missing webhook delivery, unknown provider object, and an apply rerun that becomes a no-op.

- [ ] **Step 2: Run and confirm the reconciliation command is absent**

Run: `TZ=UTC yarn test scripts/reconcile-clerk-polar.test.ts`

Expected: FAIL because the script is missing.

- [ ] **Step 3: Implement dry-run/apply with safe repair boundaries**

Dry run reads provider/local state and emits sanitized differences. Apply can remap an unambiguous external ID, replay a verified failed event, reconcile provider customer state, and align Polar seat quantity after local authorization. It never guesses between ambiguous users/orgs or deletes untagged provider data.

- [ ] **Step 4: Execute after the full acceptance suite**

Run: `yarn clerk-polar:reconcile --dry-run`

Expected: zero drift for acceptance subjects and no secret values in output.

- [ ] **Step 5: Complete the requirement-to-evidence ledger**

For each numbered design acceptance requirement, record exact test title, report/trace/screenshot path, relevant non-secret Clerk/Polar object ID, webhook delivery ID, and database assertion. Mark any missing or indirect evidence as not accepted and rerun/fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add scripts/reconcile-clerk-polar.ts scripts/reconcile-clerk-polar.test.ts package.json docs/cutover/clerk-polar-acceptance.md
git commit -m "chore(cutover): add Clerk and Polar reconciliation"
```

### Task 6: Rehearse rollback and stage production enablement

**Files:**
- Create: `docs/cutover/clerk-polar-rollout.md`
- Create: `apps/web/playwright/clerk-polar/rollback.e2e.ts`

**Interfaces:**
- Rollback switch: `AUTH_PROVIDER=nextauth` plus deployment restart/rollback.
- Clerk enablement switch: `AUTH_PROVIDER=clerk`.
- Billing enablement remains server-side disabled until sandbox acceptance is green.

- [ ] **Step 1: Write the exact rollout and rollback runbook**

Document additive migration, Clerk import dry-run/apply, staging secrets, Clerk enablement, Polar catalog/webhook setup, billing enablement, monitored error/latency/webhook metrics, rollback switch, and data that remains valid after rollback. Include responsible actor and timestamp fields but no secret values.

- [ ] **Step 2: Run Clerk mode, then NextAuth rollback mode against the same migrated fixture**

The test signs in with Clerk, creates scheduling data, switches the test deployment to NextAuth, signs in with the unchanged password, and confirms the same numeric user and scheduling records. It also proves a locked user remains denied in both modes.

- [ ] **Step 3: Apply migrations and enable Clerk in staging**

Run the user-import dry run, resolve every collision/error, apply the import, enable Clerk, and execute the full acceptance project. Do not configure production while staging has unresolved evidence.

- [ ] **Step 4: Configure production Clerk only after sandbox/staging acceptance**

Create/reconcile the production instance with the same non-secret settings and production URLs/redirect origins. Use separate production keys/webhook secret. Do not reuse Polar sandbox IDs/tokens in any production secret store.

- [ ] **Step 5: Enable production identity, observe, then billing**

Deploy additive compatibility code with NextAuth default, import production users, switch identity to Clerk, and monitor provisioning/auth/webhook errors. Enable self-serve billing only after the defined identity observation window has no severity-one or unresolved data-integrity failures.

- [ ] **Step 6: Commit the runbook and rollback test**

```bash
git add docs/cutover/clerk-polar-rollout.md apps/web/playwright/clerk-polar/rollback.e2e.ts
git commit -m "docs(cutover): add Clerk rollout and rollback rehearsal"
```

### Task 7: Run the pre-cutover quality and security gate

**Files:**
- Modify only files required by failures discovered in this gate.
- Update: `docs/cutover/clerk-polar-acceptance.md`

**Interfaces:**
- Gate must pass on the exact commit/deployment recorded in the evidence ledger.

- [ ] **Step 1: Scan tracked changes and history for secrets**

Inspect staged/tracked diffs for Clerk secret-key patterns, Polar tokens, webhook secrets, password/MFA material, raw event payloads, test card metadata beyond published sandbox values, and `.env` additions. Remove compromised values and rotate them before continuing.

- [ ] **Step 2: Run formatting, focused tests, and full type check**

```bash
yarn biome check --write packages/features/auth packages/features/organizations packages/features/billing packages/trpc/server/routers/viewer/billing packages/trpc/server/routers/viewer/organizations apps/web/app/api/webhooks apps/web/playwright/clerk-polar scripts/provision-polar-sandbox.ts scripts/reconcile-clerk-polar.ts scripts/cleanup-clerk-polar-e2e.ts
TZ=UTC yarn test packages/features/auth packages/features/organizations packages/features/billing packages/trpc/server/routers/viewer/billing packages/trpc/server/routers/viewer/organizations apps/web/app/api/webhooks scripts/provision-polar-sandbox.test.ts scripts/reconcile-clerk-polar.test.ts scripts/cleanup-clerk-polar-e2e.test.ts
yarn type-check:ci --force
```

Expected: all commands pass with no unexplained warning/error.

- [ ] **Step 3: Run the full serial acceptance and rollback projects**

```bash
AUTH_PROVIDER=clerk NEXT_PUBLIC_IS_E2E=1 PLAYWRIGHT_HEADLESS=1 yarn playwright test --project=@calcom/clerk-polar --workers=1
PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/clerk-polar/rollback.e2e.ts --project=@calcom/web --workers=1
```

Expected: both projects pass; cleanup confirms no tagged external/local objects remain.

- [ ] **Step 4: Audit every design requirement against authoritative evidence**

Review Sections 4–15 of the design. For every statement, identify current code, test result, dashboard object, runtime behavior, or runbook evidence. Fix/retest every item marked missing, contradicted, or indirect. A green narrow test cannot satisfy a broader requirement.

- [ ] **Step 5: Commit gate-driven fixes and finalized evidence**

Use focused conventional commits for code fixes, then:

```bash
git add docs/cutover/clerk-polar-acceptance.md
git commit -m "docs(cutover): record Clerk and Polar acceptance"
```

### Task 8: Remove NextAuth and local credential ownership after thirty stable days

**Files:**
- Delete: `apps/web/pages/api/auth/[...nextauth].ts`
- Delete: legacy NextAuth-only modules under `packages/features/auth/lib/` after an `rg`-verified inventory.
- Delete: legacy password-reset and local MFA UI/routes after Clerk equivalents are accepted.
- Modify: `apps/web/package.json`
- Modify: `packages/features/auth/package.json`
- Modify: `packages/types/next-auth.d.ts`
- Modify: `packages/prisma/schema.prisma`
- Create: a dated Prisma migration that removes obsolete local session/password/MFA ownership only after backup/rollback approval.
- Modify: session consumers remaining in the final inventory.
- Update: `docs/cutover/clerk-polar-rollout.md`

**Interfaces:**
- Entry gate: thirty consecutive production days recorded with Clerk enabled, no unresolved identity-integrity incident, webhook/reconciliation healthy, and rollback rehearsal passed.
- Exit gate: `rg` finds no NextAuth runtime imports/routes/configuration and no local password/MFA authentication path.

- [ ] **Step 1: Verify the dated stability evidence before any deletion**

Confirm the enablement timestamp plus thirty full days, incident log, auth/provisioning error metrics, webhook failures, reconciliation reports, and rollback rehearsal. If any evidence is missing or the interval is shorter, stop this task and leave compatibility code intact.

- [ ] **Step 2: Produce the final legacy inventory**

Run: `rg -n 'next-auth|NextAuth|getServerSession|UserPassword|twoFactorSecret|backupCodes|forgot-password|changePassword' apps/web packages package.json yarn.lock`

Classify every result as runtime legacy, migration-only historical schema, unrelated wording, or test. Record the exact deletion/migration list in the rollout document before editing.

- [ ] **Step 3: Remove runtime NextAuth and migrate remaining consumers**

Delete the route and legacy-only modules, remove NextAuth dependencies/configuration/environment variables, make Clerk the sole provider in `currentSession`, and update remaining imports to the Convenio adapter. Keep migration history files unchanged.

- [ ] **Step 4: Remove local credential ownership safely**

After an approved backup and production migration rehearsal, remove obsolete password/session/MFA fields/models and reset/change-password routes that Clerk owns. Do not remove identity-provider/calendar OAuth data used for calendar connections.

- [ ] **Step 5: Run negative inventory, complete tests, and full acceptance**

```bash
rg -n 'next-auth|NextAuth|getServerSession' apps/web packages package.json yarn.lock
yarn biome check --write apps/web packages/features/auth packages/trpc/server
TZ=UTC yarn test packages/features/auth packages/features/organizations packages/features/billing
yarn type-check:ci --force
AUTH_PROVIDER=clerk NEXT_PUBLIC_IS_E2E=1 PLAYWRIGHT_HEADLESS=1 yarn playwright test --project=@calcom/clerk-polar --workers=1
```

Expected: inventory returns only intentional migration-history/document references, all tests pass, and the full acceptance remains green without legacy configuration.

- [ ] **Step 6: Commit cleanup in reviewable dependency order**

Use separate commits for consumer migration, NextAuth dependency/route removal, credential schema/data cleanup, and legacy test removal. Each commit stays within the repository limits and is independently type-checked.

- [ ] **Step 7: Run the final completion audit**

Re-audit the design, all four implementation plans, dashboard desired state, all acceptance scenarios, external cleanup, security scan, and negative legacy inventory. Mark the program complete only when each item has direct current-state evidence and no required work remains.
