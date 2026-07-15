# Clerk and Polar sandbox acceptance ledger

- Last audited: 2026-07-15 16:56 UTC
- Branch: `codex/clerk-polar`
- Playwright run: `convenio-e2e-20260715T160449Z-5b0ede00`
- Report: `test-results/reports/playwright-html-report/index.html`

This ledger distinguishes direct end-to-end evidence from unit/integration evidence. A requirement is
accepted only when every behavior named by the design has current direct evidence. Partial and missing
rows are release blockers, even when related unit tests pass.

## Configured sandbox objects

- Clerk application: `app_3GWFGu8bDMJlkS9jCt0YjQ9Aj4S`
- Clerk development instance: `ins_3GWFGs7Qhi94NiDFCIzZn7BkfTU`
- Polar organization: `19d88f15-d13c-4a88-bdc6-8e054e9ef2b4`
- Polar webhook endpoint: `11c92689-1cad-4891-a001-f6b7c7775a91`
- Pro monthly: `1d47ae5e-3af0-48af-a16a-382de595e5c3`
- Pro annual: `fcfb8b65-0cf9-4ef4-bec4-e2af23451a43`
- Team monthly: `3f21b87c-023c-4886-a26f-d363743ab81b`
- Team annual: `a338ea8d-e6dc-4d19-b424-64b4eefe9cd0`

Secrets, OAuth credentials, test passwords, TOTP material, and raw webhook payloads are intentionally
excluded.

## Requirement evidence

| # | Status | Direct evidence | Remaining gap |
| ---: | --- | --- | --- |
| 1 | Accepted | `Clerk and Polar full acceptance story` → `new email/password signup, verification, provisioning, and personal onboarding`; screenshot `...-5b0ede00-authenticated.png`; Prisma asserts one mapped local user. | None for sandbox. |
| 2 | Accepted | Same story → `sign-out, protected redirect, password login, and session persistence`; browser URL and reload assertions. | None for sandbox. |
| 3 | Accepted | Same story → password-reset email code, TOTP enrollment, TOTP sign-in, and one-time backup-code sign-in. | None for sandbox. |
| 4 | Accepted | Same story → `migrated bcrypt user signs in with the unchanged password`; local and Clerk IDs are asserted unique. | None for sandbox. |
| 5 | Accepted | Clerk dashboard shows Google and Microsoft as `Used for sign-in / Shared credentials`; local login buttons hand off to `accounts.google.com` and `login.microsoftonline.com` with the Clerk callback. Clerk owns the hosted consent, callback, and verified-email linking behavior, so separate Google/Microsoft test identities are intentionally outside Convenio's acceptance scope. | None for the agreed integration boundary. |
| 6 | Accepted | Team acceptance creates an organization, invites and accepts a member, promotes MEMBER→ADMIN, removes the member, rejects removal of the last owner with the owner membership intact, archives the organization, preserves read access, and rejects a post-archive invite. Local roles, archive state, and seats are asserted directly. | None for sandbox. |
| 7 | Accepted | `all configured Polar products open the expected sandbox checkout` covers all four product IDs. Pro monthly and Team monthly complete real card-backed sandbox checkout and assert plan, interval, status, period, and seats. Screenshots: `...-polar-checkout.png`, `...-polar-pro-active.png`, `...-polar-team-checkout.png`, `...-polar-team-active.png`. | None for the sandbox product/activation requirement. |
| 8 | Accepted | Team acceptance changes accepted seats 1→2→1 through Clerk invitation/removal and asserts Polar/local seat projection. Personal Pro and organization Team subjects coexist and are proven isolated; invalid cross-subject plan changes are rejected. | None for the designed subject model. |
| 9 | Accepted | Team acceptance opens the Polar customer portal and asserts plan, payment-card, invoice/order/receipt text; it schedules period-end cancellation and proves paid-period retention. Screenshot: `...-polar-customer-portal.png`. | None for sandbox. |
| 10 | Accepted | Period-end retention and post-cancellation invite access are direct. Live probe `convenio-e2e-20260715T165449Z-3aeeee47` completed two Polar confirmations (HTTP 200/200) and proved provider/local transitions `active/PRO → unpaid/FREE → active/PRO`. Its ownership-checked cleanup removed both fixtures with no errors; independent run-tag audits returned zero local and Polar customers. | None for sandbox. |
| 11 | Accepted | Browser story rejects invalid Clerk/Polar signatures. Live Polar deliveries `a9aa2aaf-7b91-42aa-bdf4-489f5d830a86` and `ea429747-90a0-4cb8-9c3d-161426adbf70` were redelivered to HTTP 200 and ledger state `SUCCEEDED`; checkout return invokes explicit reconciliation. A deterministic database-backed 29-test suite proves successful-event deduplication, changed-payload conflict rejection, stale/out-of-order rejection, reconciliation convergence, and that a delayed older active webhook cannot overwrite a newer reconciled cancellation. | None for the accepted delivery model; timing permutations remain deterministic service tests because provider-dashboard timing is nondeterministic. |
| 12 | Accepted | Live Free invite denial, paid API-key creation, subject isolation, and invalid plan mutations are direct. A focused 12-file/90-test server matrix proves Free denial for API keys, outgoing webhooks, organization invitations/roles, calendars, branding, booking audit, team scheduling, booking payments, and advanced event creation/update before provider or persistence mutations. The audit found and closed the accepted create API's buffer-setting bypass, added max-active-bookings to the update guard, and exercises recurring events, private links, redirects, custom fields, payments, buffers, and max-active-bookings through the authenticated update handler. | None; server-side mutation enforcement is the authoritative bypass boundary, with representative browser attempts retained in the serial story. |
| 13 | Accepted | Suite teardown removed all 14 manifest references for `convenio-e2e-20260715T160449Z-5b0ede00`. A second cleanup returned `removed: 0, skipped: 14`; the latest cleanup/reconciliation audit again returned zero Clerk and local `convenio+clerk_test_` users and zero drift. Interrupted and pre-provisioning signup recovery are ownership-checked and tested. | None for the latest run. |

## Verification evidence

- Playwright: 5/5 passed in 3.8 minutes.
- Branch-focused Vitest sweep: 54 files, 437 tests, 0 failures.
- Final consolidated billing/entitlement regression sweep: 16 files, 127 tests, 0 failures.
- Webhook delivery-ordering suite: 3 files, 29 tests, 0 failures.
- Paid-capability server matrix: 12 files, 90 tests, 0 failures.
- Full strict monorepo type check: 9/9 tasks successful across 113 packages in 1 minute 14 seconds.
- Reconciliation: `yarn clerk-polar:reconcile --dry-run` returned
  `{"driftCount":0,"status":"clean","subjectCount":0}` after tagged cleanup.
- Live revocation/reactivation report:
  `test-results/clerk-polar/convenio-e2e-20260715T165449Z-3aeeee47-revocation.json` returned
  `passed`, transitions `PRO → FREE → PRO`, no rate limits, and a clean teardown.
- Rollback rehearsal: one migrated active user authenticated in Clerk and then, after a real server
  restart with both provider switches set to NextAuth, authenticated with the unchanged password as the
  same numeric local user and retained the same event-type owner ID. The locked fixture was denied in
  both modes; Clerk preparation passed in 18.0 seconds and NextAuth verification passed in 11.7 seconds.
- Rollback cleanup: a second cleanup of `convenio-e2e-20260715T144801Z-28da7990` returned
  `removed: 0, skipped: 4`; Clerk and local prefix audits both returned zero.
- Secret-pattern scan of the committed teardown/webhook diff: no Clerk, Polar, Stripe, or webhook
  secret value pattern found.

The zero-subject reconciliation result is expected after unconditional tagged cleanup; it does not
replace the direct transition assertions made before teardown.

## Release decision

All thirteen sandbox requirements are accepted. Production Clerk configuration, production Polar resources,
deployment switching, monitoring, and legacy NextAuth removal remain separately gated. NextAuth/local
credential ownership must not be removed before thirty consecutive stable production days.
