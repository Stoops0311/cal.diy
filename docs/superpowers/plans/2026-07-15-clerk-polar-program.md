# Clerk and Polar Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Clerk identity migration, organization synchronization, Polar subscriptions, typed entitlements, dashboard provisioning, rollback, and full acceptance program.

**Architecture:** Four dependency-ordered plans preserve reviewable boundaries. Identity establishes local external mappings and the provider-neutral session; organizations build on that identity; billing implements the organization seat port and access projection; cutover provisions real services and proves the combined system.

**Tech Stack:** Next.js 16, TypeScript, Clerk, Polar, Prisma/PostgreSQL, tRPC, Vitest, Playwright.

## Global Constraints

- Execute plans in the order below; do not start dashboard cutover before the relevant code and tests exist.
- Follow every global constraint in each child plan.
- Keep the active provider on NextAuth until the Clerk compatibility path and rollback test pass.
- Keep billing disabled until Polar sandbox projection and entitlement tests pass.
- Never stage or overwrite unrelated dirty-worktree files.
- Do not mark the program complete before the real dashboard objects, full acceptance matrix, cleanup evidence, and final legacy-removal gate are all proven.

---

## Execution Order

- [ ] **Plan 1: Execute Clerk identity and migration**

Plan: `docs/superpowers/plans/2026-07-15-clerk-identity-migration.md`

Exit evidence: additive mapping migrated; Clerk and NextAuth modes both pass; verified signup provisions exactly one numeric local user; existing bcrypt migration is idempotent; auth UI, password recovery, MFA, and rollback tests pass.

- [ ] **Plan 2: Execute Clerk organization synchronization**

Plan: `docs/superpowers/plans/2026-07-15-clerk-organization-sync.md`

Exit evidence: one-to-one org mapping; creator/role/owner invariants; invitation and membership lifecycle; archive-not-delete; verified idempotent webhooks; authorization boundaries; injectable seat billing port.

- [ ] **Plan 3: Execute Polar billing and entitlements**

Plan: `docs/superpowers/plans/2026-07-15-polar-billing-entitlements.md`

Exit evidence: four sandbox products/two benefits; local monotonic projection; checkout/portal/changes/cancellation/reconciliation/seats; exhaustive Free/Pro/Team server gates; lifecycle and downgrade behavior.

- [ ] **Plan 4: Execute end-to-end cutover**

Plan: `docs/superpowers/plans/2026-07-15-clerk-polar-e2e-cutover.md`

Exit evidence: Clerk and Polar dashboards match desired state; full serial browser/direct-API acceptance passes; tagged cleanup leaves no fixtures; drift is zero; rollback is rehearsed; production and thirty-day cleanup gates are directly evidenced.

## Requirement Coverage

| Approved design area | Authoritative implementation plan |
| --- | --- |
| Clerk application configuration and preserved local IDs | Identity Tasks 1–6 |
| Existing-user bcrypt/MFA/social import and idempotency | Identity Task 7 |
| Provider-neutral server/client sessions, API v2, and rollback | Identity Tasks 4–9 |
| Organization mapping, roles, invites, archive, owner invariant | Organization Tasks 1–6 |
| Verified/idempotent Clerk events | Organization Tasks 1 and 3 |
| Polar catalog and server-only configuration | Billing Tasks 3 and 9 |
| Local subscription projection and monotonic lifecycle | Billing Tasks 1, 4, and 5 |
| Checkout, portal, changes, cancellation, reconciliation, seats | Billing Tasks 6 and 7 |
| Free/Pro/Team limits and non-destructive downgrade | Billing Tasks 2, 8, and 10 |
| Dashboard provisioning, evidence, cleanup, drift repair | Cutover Tasks 1–5 |
| Rollout, rollback, security gate, legacy removal | Cutover Tasks 6–8 |
| Complete signup/login/org/billing/entitlement E2E matrix | Cutover Task 4 and Billing Task 10 |

## Program Completion Gate

Run the commands in Cutover Task 7 against the exact accepted deployment, then audit every row above against current code, database assertions, dashboard state, webhook evidence, and Playwright artifacts. If any requirement lacks direct evidence, return to its owning plan and implement/retest it. Only after the dated Cutover Task 8 stability gate may the NextAuth runtime and local password/MFA ownership be removed and the program be declared complete.
