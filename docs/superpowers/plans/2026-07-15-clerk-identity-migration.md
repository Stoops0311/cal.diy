# Clerk Identity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Convenio browser identity and sessions with Clerk while preserving numeric local users, existing passwords where supported, and a thirty-day NextAuth rollback path.

**Architecture:** A Convenio-owned session adapter resolves a verified Clerk identity to the existing local user/session projection. `AUTH_PROVIDER` selects Clerk or the legacy NextAuth reader during rollout; protected application code consumes the adapter instead of provider-specific APIs. Existing users are imported idempotently with Clerk `externalId = String(User.id)`, while new users are provisioned synchronously after Clerk verification.

**Tech Stack:** Next.js 16, TypeScript, Clerk Next.js SDK, Clerk Backend SDK, NextAuth 4 compatibility path, Prisma/PostgreSQL, Vitest, Playwright.

## Global Constraints

- Preserve `User.id` as the internal identity and all existing scheduling relationships.
- Never log or persist password hashes, TOTP secrets, backup codes, Clerk secrets, or full webhook payloads.
- `AUTH_PROVIDER` accepts exactly `nextauth` or `clerk`; default to `nextauth` until staging acceptance.
- Locked local users remain unauthorized even when Clerk authenticates them.
- New dependencies require explicit approval; the user granted that approval for this program on 2026-07-15.
- Schema changes require explicit approval; the user granted that approval for this program on 2026-07-15.
- Use direct source imports, `import type`, Prisma `select`, translated UI strings, Biome, and focused changes below ten code files and five hundred code lines per commit.
- Keep the NextAuth route, password data, reset flow, and session reader available for thirty stable production days.

---

## File Structure

- `packages/prisma/schema.prisma`: nullable unique Clerk identity mapping on `User`.
- `packages/prisma/migrations/20260715090000_add_clerk_identity_mapping/migration.sql`: additive mapping migration.
- `packages/features/auth/lib/currentSession.ts`: provider-neutral session type and resolver.
- `packages/features/auth/lib/useCurrentSession.ts`: provider-neutral client hook with the existing `data/status/update` contract.
- `packages/features/auth/lib/ensureLocalIdentity.ts`: idempotent verified-Clerk-user to local-user provisioning.
- `packages/features/auth/lib/clerkClient.ts`: server-only Clerk client/configuration validation.
- `packages/features/auth/lib/clerkRequestAuth.ts`: Pages/API request authentication.
- `packages/features/auth/scripts/importUsersToClerk.ts`: dry-run/apply migration command.
- `packages/features/auth/lib/*.test.ts`: unit coverage for matching, lockout, and provider selection.
- `apps/web/app/layout.tsx`: Clerk provider composition.
- `apps/web/proxy.ts`: Clerk middleware plus existing CSP/embed/return-to behavior.
- `apps/web/app/(use-page-wrapper)/auth/{login,signin,logout}/page.tsx` and `apps/web/app/(use-page-wrapper)/signup/page.tsx`: Clerk auth UI at legacy URLs.
- `packages/trpc/server/createContext.ts`: provider-neutral session type.
- `packages/trpc/server/createNextApiHandler.ts`: provider-neutral session getter for all Pages Router tRPC endpoints.
- `apps/web/pages/api/auth/[...nextauth].ts`: rollback-only NextAuth endpoint guard.
- `apps/web/playwright/auth/clerk-identity.e2e.ts`: signup, login, persistence, password recovery, and MFA acceptance.

### Task 1: Add the Clerk identity mapping

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260715090000_add_clerk_identity_mapping/migration.sql`
- Test: `packages/features/auth/lib/ensureLocalIdentity.test.ts`

**Interfaces:**
- Produces: `User.clerkUserId: string | null`, unique when present.
- Consumes: existing `User.id`, `User.email`, `User.username`, `User.locked`, and `User.completedOnboarding`.

- [ ] **Step 1: Add a schema assertion that fails before the mapping exists**

```ts
import { describe, expect, it } from "vitest";

import { prisma } from "@calcom/prisma";

describe("Clerk user mapping", () => {
  it("persists a unique Clerk user id", async () => {
    const email = `clerk-map-${crypto.randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, clerkUserId: `user_${crypto.randomUUID()}` },
      select: { id: true, clerkUserId: true },
    });
    expect(user.clerkUserId).toMatch(/^user_/);
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm Prisma rejects the unknown field**

Run: `TZ=UTC yarn test packages/features/auth/lib/ensureLocalIdentity.test.ts`

Expected: FAIL with a TypeScript or Prisma error that `clerkUserId` does not exist.

- [ ] **Step 3: Add the mapping and additive migration**

```prisma
model User {
  id          Int     @id @default(autoincrement())
  clerkUserId String? @unique
  // Existing fields and relations remain unchanged.
}
```

```sql
ALTER TABLE "users" ADD COLUMN "clerkUserId" TEXT;
CREATE UNIQUE INDEX "users_clerkUserId_key" ON "users"("clerkUserId");
```

- [ ] **Step 4: Generate Prisma artifacts and run the test**

Run: `yarn workspace @calcom/prisma generate-schemas && TZ=UTC yarn test packages/features/auth/lib/ensureLocalIdentity.test.ts`

Expected: Prisma generation succeeds and the focused test passes.

- [ ] **Step 5: Format and commit**

```bash
yarn biome check --write packages/prisma/schema.prisma packages/features/auth/lib/ensureLocalIdentity.test.ts
git add packages/prisma/schema.prisma packages/prisma/migrations/20260715090000_add_clerk_identity_mapping/migration.sql packages/features/auth/lib/ensureLocalIdentity.test.ts
git commit -m "feat(auth): add Clerk user mapping"
```

### Task 2: Install Clerk and validate server configuration

**Files:**
- Modify: `apps/web/package.json`
- Modify: `packages/features/auth/package.json`
- Modify: `yarn.lock`
- Create: `packages/features/auth/lib/clerkClient.ts`
- Create: `packages/features/auth/lib/clerkClient.test.ts`

**Interfaces:**
- Produces: `getClerkBackendClient(): ClerkClient` and `getAuthProvider(): "nextauth" | "clerk"`.
- Environment: `AUTH_PROVIDER`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

- [ ] **Step 1: Write configuration tests**

```ts
describe("getAuthProvider", () => {
  it.each(["nextauth", "clerk"] as const)("accepts %s", (provider) => {
    expect(getAuthProvider({ AUTH_PROVIDER: provider })).toBe(provider);
  });

  it("defaults to nextauth", () => {
    expect(getAuthProvider({})).toBe("nextauth");
  });

  it("rejects unknown providers", () => {
    expect(() => getAuthProvider({ AUTH_PROVIDER: "other" })).toThrow("AUTH_PROVIDER");
  });
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `TZ=UTC yarn test packages/features/auth/lib/clerkClient.test.ts`

Expected: FAIL because `clerkClient.ts` does not exist.

- [ ] **Step 3: Add `@clerk/nextjs`, `@clerk/backend`, and the validated configuration**

```ts
export type AuthProvider = "nextauth" | "clerk";

export function getAuthProvider(env: NodeJS.ProcessEnv = process.env): AuthProvider {
  const value = env.AUTH_PROVIDER ?? "nextauth";
  if (value !== "nextauth" && value !== "clerk") {
    throw new Error("AUTH_PROVIDER must be nextauth or clerk");
  }
  return value;
}
```

Use `yarn workspace @calcom/web add @clerk/nextjs` and `yarn workspace @calcom/feature-auth add @clerk/backend`.

- [ ] **Step 4: Run tests and package type checks**

Run: `TZ=UTC yarn test packages/features/auth/lib/clerkClient.test.ts && yarn workspace @calcom/web type-check`

Expected: configuration tests and web type check pass.

- [ ] **Step 5: Commit the dependency/configuration slice**

```bash
git add apps/web/package.json packages/features/auth/package.json packages/features/auth/lib/clerkClient.ts packages/features/auth/lib/clerkClient.test.ts yarn.lock
git commit -m "feat(auth): configure Clerk SDK"
```

### Task 3: Provision a verified Clerk identity locally

**Files:**
- Create: `packages/features/auth/lib/ensureLocalIdentity.ts`
- Modify: `packages/features/auth/lib/ensureLocalIdentity.test.ts`

**Interfaces:**
- Consumes: `ClerkIdentityInput { clerkUserId: string; externalId: string | null; primaryEmail: string; emailVerified: boolean; username: string | null; name: string | null; avatarUrl: string | null }`.
- Produces: `ensureLocalIdentity(input): Promise<{ userId: number; created: boolean; completedOnboarding: boolean }>`.
- Error codes: `CLERK_EMAIL_UNVERIFIED`, `CLERK_IDENTITY_AMBIGUOUS`, `LOCAL_ACCOUNT_LOCKED`, `USERNAME_UNAVAILABLE`.

- [ ] **Step 1: Add tests for all identity-resolution branches**

```ts
it.each([
  ["clerk id", { clerkUserId: "user_existing" }, 41],
  ["numeric external id", { externalId: "42" }, 42],
  ["verified email", { primaryEmail: "existing@example.com", emailVerified: true }, 43],
])("resolves by %s", async (_label, identity, expectedUserId) => {
  await expect(ensureLocalIdentity(makeIdentity(identity))).resolves.toMatchObject({ userId: expectedUserId });
});

it("rejects an unverified email before matching", async () => {
  await expect(ensureLocalIdentity(makeIdentity({ emailVerified: false }))).rejects.toMatchObject({
    code: "CLERK_EMAIL_UNVERIFIED",
  });
});
```

Also cover new-user creation, username suffixing, concurrent retries, ambiguous email records, and a locked matched user.

- [ ] **Step 2: Confirm the tests fail without the service**

Run: `TZ=UTC yarn test packages/features/auth/lib/ensureLocalIdentity.test.ts`

Expected: FAIL because `ensureLocalIdentity` is not exported.

- [ ] **Step 3: Implement resolution in one transaction using `select`**

```ts
export async function ensureLocalIdentity(input: ClerkIdentityInput) {
  if (!input.emailVerified) throw new IdentityProvisioningError("CLERK_EMAIL_UNVERIFIED");
  return prisma.$transaction(async (tx) => {
    const mapped = await findUniqueLocalUser(tx, input);
    if (mapped?.locked) throw new IdentityProvisioningError("LOCAL_ACCOUNT_LOCKED");
    if (mapped) return mapAndReturn(tx, mapped, input.clerkUserId);
    return createLocalUser(tx, input);
  });
}
```

Catch the unique `clerkUserId` race, re-read the winning row, and never match an unverified Clerk email.

- [ ] **Step 4: Run service tests and format**

Run: `TZ=UTC yarn test packages/features/auth/lib/ensureLocalIdentity.test.ts && yarn biome check --write packages/features/auth/lib/ensureLocalIdentity.ts packages/features/auth/lib/ensureLocalIdentity.test.ts`

Expected: all identity-resolution cases pass.

- [ ] **Step 5: Commit**

```bash
git add packages/features/auth/lib/ensureLocalIdentity.ts packages/features/auth/lib/ensureLocalIdentity.test.ts
git commit -m "feat(auth): provision local Clerk identities"
```

### Task 4: Add the provider-neutral server session adapter

**Files:**
- Create: `packages/features/auth/lib/currentSession.ts`
- Create: `packages/features/auth/lib/currentSession.test.ts`
- Create: `packages/features/auth/lib/useCurrentSession.ts`
- Create: `packages/features/auth/lib/useCurrentSession.test.tsx`
- Create: `packages/features/auth/lib/clerkRequestAuth.ts`
- Modify: `packages/features/auth/lib/getServerSession.ts`
- Modify: `packages/types/next-auth.d.ts`

**Interfaces:**
- Produces: `ConvenioSession { user: { id: number; uuid: string; email: string; username: string | null; role: UserPermissionRole; completedOnboarding: boolean; locale: string } }`.
- Produces: `getCurrentSession(options?): Promise<ConvenioSession | null>`, `getCurrentSessionFromRequest(req, res): Promise<ConvenioSession | null>`, and `useCurrentSession(): { data; status; update }`.
- Legacy `getServerSession` delegates to `getCurrentSession` so callers migrate without shape changes.

- [ ] **Step 1: Write provider selection, Clerk projection, anonymous, and locked-user tests**

```ts
it("projects a Clerk session through the local user", async () => {
  clerkAuth.mockResolvedValue({ userId: "user_123" });
  ensureLocalIdentity.mockResolvedValue({ userId: 123, created: false, completedOnboarding: true });
  await expect(getCurrentSession()).resolves.toMatchObject({ user: { id: 123 } });
});

it("does not fall back to NextAuth when Clerk is selected", async () => {
  clerkAuth.mockResolvedValue({ userId: null });
  await expect(getCurrentSession()).resolves.toBeNull();
  expect(nextAuthSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and observe missing-adapter failures**

Run: `TZ=UTC yarn test packages/features/auth/lib/currentSession.test.ts`

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement App Router and Pages/API readers**

Use Clerk `auth()` in App Router contexts and Clerk request verification for Pages/API contexts. Fetch the local session projection with a Prisma `select`; return `null` for missing mappings or locked users. Preserve the public `Session`-compatible shape during the rollback window. The client hook selects Clerk `useAuth` plus the local `viewer.me.get` projection in Clerk mode and the legacy NextAuth hook in rollback mode; its `update` refetches the local projection.

```ts
export async function getCurrentSession(options?: CurrentSessionOptions): Promise<ConvenioSession | null> {
  if (getAuthProvider() === "nextauth") return getLegacyNextAuthSession(options);
  const identity = options?.request ? await authenticateClerkRequest(options.request) : await auth();
  if (!identity.userId) return null;
  return resolveConvenioSession(identity.userId);
}
```

- [ ] **Step 4: Run auth tests**

Run: `TZ=UTC yarn test packages/features/auth/lib/currentSession.test.ts packages/features/auth/lib/useCurrentSession.test.tsx packages/features/auth/lib/getServerSession.test.ts`

Expected: both provider paths and existing session contracts pass.

- [ ] **Step 5: Commit**

```bash
git add packages/features/auth/lib/currentSession.ts packages/features/auth/lib/currentSession.test.ts packages/features/auth/lib/useCurrentSession.ts packages/features/auth/lib/useCurrentSession.test.tsx packages/features/auth/lib/clerkRequestAuth.ts packages/features/auth/lib/getServerSession.ts packages/types/next-auth.d.ts
git commit -m "feat(auth): add provider-neutral session adapter"
```

### Task 5: Wire Clerk into Next.js and tRPC without losing existing proxy behavior

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/proxy.ts`
- Modify: `packages/trpc/server/createContext.ts`
- Modify: `packages/trpc/server/createNextApiHandler.ts`
- Modify: `apps/web/pages/api/auth/[...nextauth].ts`
- Test: `apps/web/proxy.test.ts`

**Interfaces:**
- Consumes: `getCurrentSessionFromRequest` and `getAuthProvider`.
- Produces: authenticated tRPC context under Clerk; rollback NextAuth handler only when `AUTH_PROVIDER=nextauth`.
- Public routes include booking pages, embeds, checkout return, OAuth callbacks, health endpoints, and `/api/webhooks/{clerk,polar}`.

- [ ] **Step 1: Add proxy behavior tests**

Cover anonymous dashboard redirect, public booking pass-through, both public webhook routes, CSP nonce, embed headers, signup-disabled response, return-to cookie, and Clerk route matching.

```ts
it("keeps provider webhooks public", async () => {
  await expect(runProxy("/api/webhooks/clerk")).resolves.toMatchObject({ status: 200 });
  await expect(runProxy("/api/webhooks/polar")).resolves.toMatchObject({ status: 200 });
});
```

- [ ] **Step 2: Run the proxy test and confirm protected-route behavior is absent**

Run: `TZ=UTC yarn test apps/web/proxy.test.ts`

Expected: FAIL on the Clerk protection assertions.

- [ ] **Step 3: Compose Clerk middleware and preserve all existing response transformations**

Wrap the current proxy handler with Clerk middleware only when Clerk is configured. Call `auth.protect()` for dashboard/settings/organization routes and mutation APIs. Keep `responseWithHeaders` as the final response transformation.

- [ ] **Step 4: Update tRPC context and legacy auth route**

```ts
const session = await getCurrentSessionFromRequest(req, res);
return createContext({ req, res }, async () => session);
```

Return `404` from `[...nextauth].ts` when Clerk is active; do not delete the handler during rollback.

- [ ] **Step 5: Run proxy, tRPC, and auth tests**

Run: `TZ=UTC yarn test apps/web/proxy.test.ts packages/trpc/server/createNextApiHandler.test.ts packages/features/auth/lib/currentSession.test.ts`

Expected: all focused tests pass in both provider modes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/proxy.ts apps/web/proxy.test.ts packages/trpc/server/createContext.ts packages/trpc/server/createNextApiHandler.ts apps/web/pages/api/auth/[...nextauth].ts
git commit -m "feat(auth): route Clerk sessions through the application"
```

### Task 6: Replace legacy auth screens with Clerk components

**Files:**
- Modify: `apps/web/app/(use-page-wrapper)/auth/login/page.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/auth/signin/page.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/auth/logout/page.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/signup/page.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/auth/forgot-password/page.tsx`
- Modify: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/security/two-factor-auth/page.tsx`
- Modify: `packages/i18n/locales/en/common.json`
- Test: `apps/web/playwright/auth/clerk-identity.e2e.ts`

**Interfaces:**
- Clerk component routes: sign-in `/auth/login`, sign-up `/signup`, post-auth `/event-types`, account security `/settings/security/two-factor-auth`.
- Rollback behavior: legacy pages render when `AUTH_PROVIDER=nextauth`.

- [ ] **Step 1: Add browser expectations for the branded auth routes**

```ts
test("email signup provisions one local account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(testEmail);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Verification code").fill("424242");
  await expect(page).toHaveURL(/event-types|getting-started/);
});
```

Add logout/protected redirect, password sign-in, forgotten password, TOTP enrollment, backup-code recovery, and session persistence cases.

- [ ] **Step 2: Implement provider-switched Clerk screens and translated surrounding copy**

Render Clerk `<SignIn />`, `<SignUp />`, `<UserProfile />`, and sign-out APIs under Clerk mode. Preserve existing legacy components under NextAuth mode. Configure appearance from Convenio tokens without embedding secrets.

- [ ] **Step 3: Run component/type checks**

Run: `yarn biome check --write apps/web/app/'(use-page-wrapper)'/auth packages/i18n/locales/en/common.json && yarn workspace @calcom/web type-check`

Expected: formatting and type checks pass.

- [ ] **Step 4: Run the focused Clerk browser spec against the development instance**

Run: `AUTH_PROVIDER=clerk NEXT_PUBLIC_IS_E2E=1 PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/auth/clerk-identity.e2e.ts --project=@calcom/web --workers=1`

Expected: signup, sign-in, sign-out, recovery, and MFA cases pass with traces retained on failure.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/'(use-page-wrapper)'/auth apps/web/app/'(use-page-wrapper)'/signup/page.tsx apps/web/app/'(use-page-wrapper)'/settings/'(settings-layout)'/security/two-factor-auth/page.tsx apps/web/playwright/auth/clerk-identity.e2e.ts packages/i18n/locales/en/common.json
git commit -m "feat(auth): use Clerk authentication screens"
```

### Task 7: Import existing users idempotently

**Files:**
- Create: `packages/features/auth/scripts/importUsersToClerk.ts`
- Create: `packages/features/auth/scripts/importUsersToClerk.test.ts`
- Modify: `packages/features/auth/package.json`

**Interfaces:**
- CLI: `yarn workspace @calcom/feature-auth clerk:import-users --dry-run` or `--apply`; exactly one mode is required.
- Produces: sanitized summary counts and per-local-user error codes.
- Match order: local `clerkUserId`, Clerk `externalId`, verified primary email.

- [ ] **Step 1: Write migration planning and redaction tests**

Cover duplicate email, invalid username, locked user, unsupported hash, OAuth-only user, bcrypt user, MFA material, existing externalId, partial failure, and a second identical run.

```ts
expect(formatFailure({ userId: 7, code: "CLERK_CREATE_FAILED", secret: "hidden" })).toEqual({
  userId: 7,
  code: "CLERK_CREATE_FAILED",
});
```

- [ ] **Step 2: Run tests and confirm the CLI module is absent**

Run: `TZ=UTC yarn test packages/features/auth/scripts/importUsersToClerk.test.ts`

Expected: FAIL because the import command is missing.

- [ ] **Step 3: Implement streaming dry-run/apply behavior**

Read users in deterministic ID batches with Prisma `select`. For apply, call Clerk user creation with bcrypt migration fields, verified primary email, supported TOTP/backup material, and `externalId`. Update only `clerkUserId` after a successful create or deterministic existing-user match. Do not write an export file.

- [ ] **Step 4: Run tests and a local dry run**

Run: `TZ=UTC yarn test packages/features/auth/scripts/importUsersToClerk.test.ts && yarn workspace @calcom/feature-auth clerk:import-users --dry-run`

Expected: tests pass; dry run prints only counts, local IDs, and sanitized issue codes.

- [ ] **Step 5: Apply to a tagged staging fixture and rerun**

Run the command twice with a fixture filter supported only in non-production. Expected: first run creates or maps one Clerk user; second run reports it as already mapped and creates zero users.

- [ ] **Step 6: Commit**

```bash
git add packages/features/auth/scripts/importUsersToClerk.ts packages/features/auth/scripts/importUsersToClerk.test.ts packages/features/auth/package.json
git commit -m "feat(auth): add idempotent Clerk user import"
```

### Task 8: Inventory remaining provider-specific consumers and prove rollback

**Files:**
- Create: `docs/auth/clerk-rollout-runbook.md`
- Modify: provider-specific consumers returned by the inventory command, in slices below repository limits.
- Test: `apps/web/playwright/auth/provider-rollback.e2e.ts`

**Interfaces:**
- All protected application code calls `getCurrentSession`, `getCurrentSessionFromRequest`, or `useCurrentSession`; direct provider imports remain only inside the compatibility boundary and legacy rollback route.

- [ ] **Step 1: Produce the authoritative consumer inventory**

Run: `rg -l 'next-auth/react|next-auth/next|getServerSession|useSession\(' apps/web packages --glob '!packages/features/auth/lib/next-auth-*' --glob '!apps/web/pages/api/auth/[...nextauth].ts'`

Expected: a finite path list grouped into server, client, API, and test consumers.

- [ ] **Step 2: Migrate each group through the adapter in reviewable commits**

Server code imports `getCurrentSession`; API code imports `getCurrentSessionFromRequest`; clients import the Convenio `useCurrentSession` hook. Preserve the existing projected shape and tests. Do not remove NextAuth dependencies in this task.

- [ ] **Step 3: Add a dual-provider rollback browser test**

Run the same protected-route and session-persistence assertions once with `AUTH_PROVIDER=clerk` and once with `AUTH_PROVIDER=nextauth`. Expected: both modes authenticate and reach the dashboard; a locked fixture is rejected in both.

- [ ] **Step 4: Write the rollout runbook**

Document required environment variables, import dry-run/apply, enablement order, metrics, rollback command, data preserved by rollback, and the dated thirty-day cleanup gate. Never include credential values.

- [ ] **Step 5: Run the identity plan verification gate**

```bash
git diff --name-only 271f072164..HEAD -- '*.ts' '*.tsx' '*.json' | xargs yarn biome check --write
TZ=UTC yarn test packages/features/auth apps/web/proxy.test.ts packages/trpc/server/createNextApiHandler.test.ts
yarn type-check:ci --force
PLAYWRIGHT_HEADLESS=1 yarn playwright test apps/web/playwright/auth/clerk-identity.e2e.ts apps/web/playwright/auth/provider-rollback.e2e.ts --project=@calcom/web --workers=1
```

Expected: all commands pass; no secrets appear in output; direct NextAuth imports are confined to the compatibility boundary.

- [ ] **Step 6: Commit**

```bash
git add docs/auth/clerk-rollout-runbook.md apps/web/playwright/auth/provider-rollback.e2e.ts
git commit -m "refactor(auth): route sessions through Clerk adapter"
```

### Task 9: Replace the API v2 browser-cookie strategy with Clerk verification

**Files:**
- Modify: `apps/api/v2/package.json`
- Modify: `yarn.lock`
- Create: `apps/api/v2/src/modules/auth/strategies/clerk/clerk.strategy.ts`
- Create: `apps/api/v2/src/modules/auth/strategies/clerk/clerk.strategy.e2e-spec.ts`
- Create: `apps/api/v2/src/modules/auth/guards/clerk/clerk.guard.ts`
- Modify: `apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts`
- Modify: `apps/api/v2/src/modules/auth/guards/permissions/permissions.guard.ts`
- Modify: `apps/api/v2/src/modules/auth/auth.module.ts`
- Modify: `apps/api/v2/src/lib/enums/auth-methods.ts`

**Interfaces:**
- Produces: Passport strategy name `clerk` resolving a verified Clerk token to the existing local numeric user by `clerkUserId`.
- Preserves: API key and OAuth client authentication strategies unchanged.
- Rollback: NextAuth cookie verification remains selectable while `AUTH_PROVIDER=nextauth`.

- [ ] **Step 1: Write API v2 strategy tests**

```ts
it("resolves a verified Clerk token to the mapped local user", async () => {
  verifyToken.mockResolvedValue({ sub: "user_clerk" });
  usersRepository.findByClerkUserId.mockResolvedValue({ id: 73, locked: false });
  await expect(strategy.validate(requestWithBearer("token"))).resolves.toMatchObject({ id: 73 });
});

it("rejects a valid Clerk token for a locked local user", async () => {
  verifyToken.mockResolvedValue({ sub: "user_locked" });
  usersRepository.findByClerkUserId.mockResolvedValue({ id: 74, locked: true });
  await expect(strategy.validate(requestWithBearer("token"))).rejects.toBeInstanceOf(UnauthorizedException);
});
```

Also assert invalid token, missing mapping, provider-mode selection, and unchanged API-key/OAuth-client success.

- [ ] **Step 2: Run the focused API v2 tests**

Run: `yarn workspace @calcom/api-v2 test apps/api/v2/src/modules/auth/strategies/clerk/clerk.strategy.e2e-spec.ts apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.e2e-spec.ts`

Expected: FAIL because the Clerk strategy is absent.

- [ ] **Step 3: Install the Clerk backend SDK and implement token verification**

Verify bearer/cookie tokens using Clerk's issuer/key configuration and required authorized parties. Resolve the local user through a repository method using Prisma `select`; reject missing or locked rows. Do not authenticate from unverified token claims.

- [ ] **Step 4: Compose provider selection without changing other strategies**

When `AUTH_PROVIDER=clerk`, `ApiAuthStrategy` attempts Clerk for browser identity after API-key/OAuth methods. When `nextauth`, preserve the existing NextAuth fallback. Update permission extraction to use the already authenticated numeric local user rather than parsing a second token.

- [ ] **Step 5: Run API v2 auth and OAuth-client tests**

Run: `yarn workspace @calcom/api-v2 test apps/api/v2/src/modules/auth/strategies/clerk/clerk.strategy.e2e-spec.ts apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.e2e-spec.ts apps/api/v2/src/modules/oauth-clients/controllers/oauth-flow/oauth-flow.controller.e2e-spec.ts`

Expected: Clerk browser identity, API keys, OAuth clients, and rollback mode all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/v2/package.json apps/api/v2/src/modules/auth/strategies/clerk apps/api/v2/src/modules/auth/guards/clerk apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts apps/api/v2/src/modules/auth/guards/permissions/permissions.guard.ts apps/api/v2/src/modules/auth/auth.module.ts apps/api/v2/src/lib/enums/auth-methods.ts yarn.lock
git commit -m "feat(api-v2): authenticate browser sessions with Clerk"
```
