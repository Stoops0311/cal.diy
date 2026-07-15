# Clerk and Polar sandbox acceptance ledger

- Last audited: 2026-07-15 14:20 UTC
- Branch: `codex/clerk-polar`
- Playwright run: `convenio-e2e-20260715T133950Z-7b97fbbc`
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
| 1 | Accepted | `Clerk and Polar full acceptance story` → `new email/password signup, verification, provisioning, and personal onboarding`; screenshot `...-7b97fbbc-authenticated.png`; Prisma asserts one mapped local user. | None for sandbox. |
| 2 | Accepted | Same story → `sign-out, protected redirect, password login, and session persistence`; browser URL and reload assertions. | None for sandbox. |
| 3 | Accepted | Same story → password-reset email code, TOTP enrollment, TOTP sign-in, and one-time backup-code sign-in. | None for sandbox. |
| 4 | Accepted | Same story → `migrated bcrypt user signs in with the unchanged password`; local and Clerk IDs are asserted unique. | None for sandbox. |
| 5 | **Not accepted** | Clerk dashboard shows Google and Microsoft as `Used for sign-in / Shared credentials`; local login buttons hand off to `accounts.google.com` and `login.microsoftonline.com` with the Clerk callback. | No provider test identities are signed in. Consent/callback/account-link completion and the one-local-user assertion have not run. |
| 6 | Partial | Team acceptance creates an organization, invites and accepts a member, promotes MEMBER→ADMIN, removes the member, rejects a Free-plan invite, and asserts local roles/seats. Unit tests cover last-owner and archive rules. | Archive and last-owner protection are not exercised in the live browser story. |
| 7 | Accepted | `all configured Polar products open the expected sandbox checkout` covers all four product IDs. Pro monthly and Team monthly complete real card-backed sandbox checkout and assert plan, interval, status, period, and seats. Screenshots: `...-polar-checkout.png`, `...-polar-pro-active.png`, `...-polar-team-checkout.png`, `...-polar-team-active.png`. | None for the sandbox product/activation requirement. |
| 8 | Partial | Team acceptance changes accepted seats 1→2→1 through Clerk invitation/removal and asserts Polar/local seat projection. Personal Pro and organization Team subjects are proven isolated. | A provider-side Pro→Team product transition is not directly exercised. |
| 9 | Accepted | Team acceptance opens the Polar customer portal and asserts plan, payment-card, invoice/order/receipt text; it schedules period-end cancellation and proves paid-period retention. Screenshot: `...-polar-customer-portal.png`. | None for sandbox. |
| 10 | Partial | Period-end retention and post-cancellation invite access are direct. Unit tests cover expiration, benefit loss, read-only organization state, inactive team booking pages, and personal continuity. | Live Polar benefit removal/revocation and reactivation are not exercised end to end. |
| 11 | Partial | Browser story rejects invalid Clerk/Polar signatures. Unit tests cover duplicate and out-of-order delivery. Live Polar deliveries `a9aa2aaf-7b91-42aa-bdf4-489f5d830a86` and `ea429747-90a0-4cb8-9c3d-161426adbf70` were redelivered to HTTP 200 and ledger state `SUCCEEDED`. Checkout return invokes explicit reconciliation. | Duplicate, out-of-order, and deliberately delayed delivery are not all exercised in the serial browser run. |
| 12 | Partial | Live Free invite denial, paid API-key creation, subject isolation, and invalid plan mutations are direct. The 437-test branch sweep covers the complete server mutation matrix for Free/Pro/Team. | Not every capability has a browser-level bypass attempt in one serial acceptance run. |
| 13 | Accepted | Suite teardown removed all 14 manifest references. A second cleanup returned `removed: 0, skipped: 14`; Clerk and local audits both returned zero `convenio+clerk_test_` users. Interrupted-signup recovery is ownership-checked and tested. | None for the latest run. |

## Verification evidence

- Playwright: 5/5 passed in 4.4 minutes.
- Branch-focused Vitest sweep: 54 files, 437 tests, 0 failures.
- Strict web type check: 3/3 tasks successful.
- Reconciliation: `yarn clerk-polar:reconcile --dry-run` returned
  `{"driftCount":0,"status":"clean","subjectCount":0}` after tagged cleanup.
- Rollback rehearsal: one migrated active user authenticated in Clerk and then, after a real server
  restart with both provider switches set to NextAuth, authenticated with the unchanged password as the
  same numeric local user and retained the same event-type owner ID. The locked fixture was denied in
  both modes; NextAuth verification passed in 16.2 seconds.
- Rollback cleanup: a second cleanup of `convenio-e2e-20260715T140925Z-94bc5e68` returned
  `removed: 0, skipped: 4`; Clerk and local prefix audits both returned zero.
- Secret-pattern scan of the committed teardown/webhook diff: no Clerk, Polar, Stripe, or webhook
  secret value pattern found.

The zero-subject reconciliation result is expected after unconditional tagged cleanup; it does not
replace the direct transition assertions made before teardown.

## Release decision

Sandbox implementation is not yet fully accepted because requirements 5, 6, 8, 10, 11, and 12 still
contain direct-evidence gaps. Production Clerk configuration, production Polar resources, deployment
switching, monitoring, and legacy NextAuth removal remain separately gated. NextAuth/local credential
ownership must not be removed before thirty consecutive stable production days.
