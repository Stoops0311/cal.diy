# Clerk and Polar rollout and rollback runbook

- Last rehearsed: 2026-07-15 14:20 UTC
- Rehearsed by: Codex
- Change owner: _record before each environment change_
- Incident commander: _record before production enablement_
- Approver: _record before production enablement_
- Change started: _UTC timestamp_
- Change completed or rolled back: _UTC timestamp_

This is an additive migration. Local numeric user IDs, users, passwords, MFA material, sessions,
organization rows, memberships, schedules, bookings, and event types remain authoritative and are not
deleted during rollout. Clerk adds provider mappings and authentication. Polar adds billing projections
and entitlements. Legacy ownership may be removed only by a separate reviewed change after the stability
gate at the end of this document.

## Environment contract

Store values in the environment's secret manager. Never copy values between sandbox/staging and
production and never record values in this document.

- Provider switches: `AUTH_PROVIDER`, `NEXT_PUBLIC_AUTH_PROVIDER`
- Clerk: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` or
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`
- Polar: `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_SERVER`,
  `POLAR_WEBHOOK_SECRET`, both benefit IDs, and all four product IDs
- Compatibility: `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`, database connection values, and all
  existing email/auth settings must remain present throughout the rollback window

The variables above are allowed through Turbo's strict environment boundary. A deployment is invalid if
the server and client provider switches differ. `POLAR_SERVER=sandbox` is required outside production;
production must use separately created production resources and `POLAR_SERVER=production`.

## Preflight and additive deployment

Record an owner and UTC timestamp beside every completed action.

1. Back up the database and record the restore point. Confirm no destructive migration is included.
2. Deploy the additive schema and compatibility code with both provider switches set to `nextauth`.
3. Confirm NextAuth password login, locked-user denial, current-session projection, public booking pages,
   Clerk webhook health, and Polar webhook signature rejection.
4. Reconcile the desired Clerk settings and redirect origins. Reconcile the Polar catalog and webhook;
   in sandbox, `yarn polar:provision-sandbox --dry-run` must report the expected organization, two
   benefits, four products, and one enabled webhook before any apply.
5. Put Clerk and Polar secret names—not values—on the change record. Confirm sandbox IDs are absent from
   the production secret store.

## User import

Run the import on the exact database and Clerk instance for the target environment.

```bash
yarn workspace @calcom/feature-auth clerk:import-users --dry-run
yarn workspace @calcom/feature-auth clerk:import-users --apply
yarn workspace @calcom/feature-auth clerk:import-users --dry-run
```

The first dry run must have zero failures and every collision must be resolved before apply. Apply must
have zero failures. The final dry run must report only already-mapped users. Store the summary counts and
UTC timestamps; never store password hashes, MFA values, tokens, or raw provider responses.

## Staging Clerk enablement

1. Set both provider switches to `clerk` in one deployment and restart all web processes.
2. Confirm password signup, verification, provisioning, password login, reset, TOTP, migrated bcrypt
   login, sign-out, protected-route redirect, locked-user denial, and current-session identity.
3. Confirm Google and Microsoft consent, callback, and account linking with dedicated provider test
   identities. A redirect to the provider is not sufficient evidence.
4. Run the serial Clerk/Polar acceptance suite and the reconciliation dry run. All ledger requirements
   must be Accepted; Partial or Not accepted is a stop condition.
5. Keep self-serve production billing unavailable until the identity observation window is complete.

## Polar billing enablement

1. Reconcile production-only benefits, monthly/annual Pro products, monthly/annual Team products, and the
   production webhook. Record their IDs in the secret manager and change record, not source control.
2. Verify a real production-like checkout with an approved test customer before exposing pricing entry
   points. Confirm customer ownership, plan, interval, seats, period dates, benefits, portal access,
   cancellation retention, expiration, and reactivation.
3. Run `yarn clerk-polar:reconcile --dry-run`; any drift is a stop condition. Use scoped `--apply` only for
   an explicitly reviewed user or organization, then repeat the dry run.

## Monitoring and stop conditions

Observe at least authentication success/error rate and p95 latency, local-identity provisioning errors,
Clerk webhook non-2xx and failed-ledger counts, Polar webhook non-2xx and failed-ledger counts, checkout
and portal error rate, reconciliation drift count, organization mapping/seat drift, and entitlement
denials by plan. Record dashboards, thresholds, owner, observation start, and observation end in the
change record.

Immediately stop rollout and start rollback for a severity-one incident, identity collision or duplicate
local user, unauthorized access, lost scheduling ownership, unresolved webhook backlog, unexplained
entitlement grant/revocation, or non-zero reconciliation drift that cannot be safely scoped and repaired.

## Rollback

1. Freeze Clerk import, organization mutation, and self-serve checkout entry points. Do not delete Clerk,
   Polar, mapping, projection, delivery-ledger, or entitlement data.
2. Set `AUTH_PROVIDER=nextauth` and `NEXT_PUBLIC_AUTH_PROVIDER=nextauth` together and restart or roll back
   the deployment. Retain `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`, local password/MFA data, and the
   Clerk/Polar secrets needed by reconciliation and webhooks.
3. Verify NextAuth password login for a migrated user, the same numeric local user ID, access to the same
   scheduling data, locked-user denial, API-key behavior, public booking pages, and webhook health.
4. Run `yarn clerk-polar:reconcile --dry-run`, record drift and failed deliveries, and repair only with an
   explicitly scoped apply. Existing Polar subscriptions and local entitlement projections remain valid;
   auth rollback does not cancel billing.
5. Record rollback reason, actor, approval, start/end timestamps, affected deployment, fixture/customer
   IDs where safe, and follow-up owner.

## Rehearsal evidence

The 2026-07-15 local rehearsal used the same tagged migrated fixture in two separately restarted server
modes. Clerk mode authenticated the active user, retained one event type, and denied a locked user.
NextAuth mode then authenticated the unchanged password, returned the same numeric user ID, retained the
same event-type owner ID, and denied the same locked user. The NextAuth verification passed in 16.2
seconds. Cleanup for `convenio-e2e-20260715T140925Z-94bc5e68` was repeatable
(`removed: 0, skipped: 4` on the second run), followed by Clerk/local prefix counts of zero.

The rehearsal also found and fixed a deployment defect: Turbo's strict environment boundary had dropped
the provider switch and provider secrets. The variables are now explicitly forwarded. The first two
failed attempts were retained as diagnostic evidence and did not satisfy the rollback gate.

## Production and legacy-removal gates

Production Clerk configuration is forbidden while any sandbox/staging acceptance row is Partial or Not
accepted. Production billing follows a clean identity observation window with no severity-one or
unresolved identity-integrity incident.

NextAuth routes, password reset, local password/MFA ownership, and legacy sessions remain for at least
thirty consecutive stable production days after Clerk enablement. A separate deletion proposal must
show the enablement timestamp plus thirty full days, incident log, auth/provisioning metrics, webhook and
reconciliation health, a fresh rollback rehearsal, backup/restore approval, and an exact deletion list.
Missing evidence stops deletion and leaves compatibility code intact.
