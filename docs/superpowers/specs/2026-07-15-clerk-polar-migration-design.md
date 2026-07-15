# Convenio Clerk Authentication and Polar Billing Design

**Status:** Approved for implementation on 2026-07-15.
**Date:** 2026-07-15.
**Product:** Convenio, the branded Cal.diy scheduling application described in `PRODUCT.md`.

## 1. Goal

Replace Convenio's NextAuth-based browser authentication with Clerk, introduce self-serve subscriptions through the Polar sandbox, enforce a typed Free/Pro/Team entitlement model, and prove the complete system through repeatable end-to-end tests.

The migration must preserve existing Convenio user IDs, scheduling data, usernames, organization permissions, passwords where technically supported, and a rollback path. Polar will bill for Convenio subscriptions only. Existing booking-attendee payment integrations remain independent.

## 2. Current State

- The web application is a hybrid Next.js 16 App Router and Pages Router application.
- Authentication uses NextAuth 4.24.13, JWT sessions, local bcrypt password hashes, optional TOTP, Google login, Microsoft login, and email verification.
- The local numeric `User.id` is referenced throughout the scheduling schema and cannot be replaced with Clerk IDs.
- The browser and server code contain more than one hundred NextAuth or session-adapter call sites.
- Local `Team`, `Membership`, `Profile`, and permission models remain necessary for scheduling and authorization.
- Existing `TeamBilling` and `OrganizationBilling` models describe a Stripe-oriented commercial implementation and will not be repurposed for Polar.
- The Polar sandbox organization `Convenio` exists but has no products, access token, customers, or webhook endpoint.
- The Clerk personal workspace contains unrelated applications. Convenio will receive a separate application; existing applications will not be changed or deleted.

## 3. Architectural Decision

Use a mirrored-provider architecture:

- **Clerk owns identity:** credentials, sessions, verified email addresses, MFA, social authentication, top-level organization identity, invitations, and identity-side membership.
- **PostgreSQL owns application data:** numeric user IDs, usernames, profiles, scheduling resources, local teams, local memberships, roles, and permission enforcement.
- **Polar owns commerce:** checkout, payment collection, invoices, customer portal, subscription state, trials, proration, cancellation, and payment recovery.
- **Convenio owns access decisions:** a local subscription projection and typed entitlement service provide deterministic, low-latency authorization.

Provider webhooks reconcile external state into local projections. No protected request grants access from an unverified browser redirect or by calling Polar in the request path.

Rejected alternatives:

1. Replacing local user and team primary keys with Clerk IDs would require rewriting a large relational graph and offers no scheduling benefit.
2. Reading Polar directly for every protected action would make authorization dependent on an external API and would complicate failure recovery.
3. Reusing operational feature flags for commercial entitlements would mix release controls with contractual access and make overrides ambiguous.

## 4. Product Plans

### Free

- Price: $0; not represented by a Polar subscription.
- Two active personal event types.
- One connected calendar account.
- Personal availability and booking management.
- Convenio branding remains visible.
- No team, API key, webhook, advanced-event, or booking-payment entitlement.

### Pro

- Price: $10 monthly or $96 annually.
- Fourteen-day card-backed trial.
- Unlimited personal event types and connected calendars.
- Recurring and advanced event settings, private links, custom redirects, booking fields, and booking-payment integrations.
- API keys and outgoing webhooks.
- Convenio branding removal.
- No organization or shared-team scheduling entitlement.

### Team

- Price: $15 per accepted member monthly or $144 per accepted member annually.
- Fourteen-day card-backed trial.
- One to fifty accepted members; pending invitations do not consume seats.
- Every Pro entitlement for accepted members.
- Organization creation, invitations, member roles, and shared team event types.
- Collective and round-robin scheduling.
- Booking audit access.

Self-serve Team checkout uses a provisional-organization bootstrap. Any signed-in user may create one
owner-only organization so Polar has a stable organization subject and an initial seat. Until a verified
Team subscription is active for that organization, invitations, role changes, member activation, team
events, and all other organization administration remain read-only. A user cannot create another
provisional organization; owners whose existing organizations all have active Team access may bootstrap
another separately billed organization. Archiving remains available so an abandoned provisional
organization never traps the owner.

Workflows, Insights, SSO, SCIM, directory sync, compliance claims, enterprise support, nested organizations, and custom organization roles are not part of this release.

## 5. Clerk Application Configuration

Create a Clerk application named `Convenio` with:

- Email and password sign-up and sign-in.
- Required email-code verification.
- Required unique username.
- Google and Microsoft social authentication.
- TOTP MFA and backup codes.
- Clerk Organizations enabled.
- Clerk Billing disabled.
- Default organization roles `org:admin` and `org:member`.
- Convenio-branded authentication components mounted at the existing `/auth/login`, `/signup`, and account paths.

The development instance is configured and tested first. A production Clerk instance is configured only after the sandbox acceptance suite passes. Google and Microsoft authentication authorize identity only; calendar access continues through Convenio's separate calendar-integration OAuth flows.

Secrets remain in local or deployment secret stores. They are never committed, printed in logs, or copied into documentation.

## 6. Identity Data Model and Migration

Add nullable unique external mappings:

- `User.clerkUserId String? @unique`
- `Team.clerkOrganizationId String? @unique`
- `Team.archivedAt DateTime?` for non-destructive external organization deletion

Imported Clerk users receive `externalId = String(User.id)`. Convenio continues to use its numeric user ID internally.

### Existing users

An idempotent migration command supports `--dry-run` and `--apply` modes. It streams database records to Clerk without persisting password exports. The dry run reports duplicate emails, invalid or missing identifiers, username collisions, locked users, unsupported password records, OAuth-only users, and MFA records.

For each valid user:

- Import the primary email, name, username, verification state, created date, and numeric Convenio ID as Clerk `externalId`.
- Import the existing bcrypt digest with Clerk's bcrypt password-migration fields.
- Import decrypted TOTP and valid backup-code material where Clerk accepts it.
- Import OAuth-only accounts as verified users without passwords so verified-email social linking resolves to the existing Clerk user.
- Write the resulting Clerk user ID to `User.clerkUserId` only after Clerk creation succeeds.

Repeated execution resolves by `externalId`, then verified email, and never creates a second Clerk user for the same local user. Failures are summarized by local user ID without including password hashes, MFA secrets, or tokens.

### New users

Clerk completes identity verification first. Convenio then calls an idempotent `ensureLocalIdentity` service before entering protected onboarding. The service:

1. Resolves an existing local record by `clerkUserId`.
2. Otherwise resolves a single verified-email migration match.
3. Otherwise creates a new incomplete local user with a unique username from Clerk.
4. Stores the Clerk mapping and Clerk `externalId`.
5. Returns the existing Convenio session projection used by scheduling code.

The Clerk `user.*` webhook is reconciliation and recovery, not the only provisioning path.

### Rollback

`AUTH_PROVIDER=nextauth|clerk` selects the active provider per environment. NextAuth routes and password records remain intact during a thirty-day rollback window. After thirty stable days, a separate cleanup removes NextAuth, legacy session code, password-reset code, old session rows, and local password/MFA secrets that Clerk now owns.

Locked or archived local users remain unauthorized even when Clerk has a valid session.

## 7. Session and Route Integration

Introduce a Convenio-owned session type and adapter that projects a Clerk session into the existing local user/profile shape. This protects the migration from an all-at-once rewrite.

- App Router code uses Clerk `auth()` through the Convenio adapter.
- Pages Router and API code use Clerk request authentication through the same adapter.
- tRPC context receives the local Convenio session, never an unchecked Clerk claim.
- API v2 replaces its NextAuth cookie strategy with Clerk token verification while preserving API-key and OAuth-client strategies.
- Client code migrates from `next-auth/react` to a Convenio `useCurrentSession` hook backed by Clerk and the local user projection.

`apps/web/proxy.ts` composes Clerk route protection with the existing CSP, signup-disable, return-to, embed-header, and request-header behavior. Public booking pages, embeds, payment pages, integration OAuth callbacks, health endpoints, and both provider webhooks remain public. Dashboard, settings, organization, and mutation endpoints require server-side authentication.

## 8. Organization Synchronization

Each Clerk organization maps one-to-one to one local top-level `Team` with `isOrganization = true`. Nested subteams are not synchronized in this release.

- Clerk organization creator maps to local `OWNER`.
- Other Clerk admins map to local `ADMIN`.
- Clerk members map to local `MEMBER`.
- Clerk controls identity-side invitation and accepted membership.
- Local membership and permission records control Convenio scheduling authorization.

Convenio organization actions call Clerk and then synchronously reconcile the local record. Verified Clerk `organization.*`, invitation, and membership webhooks repair missed or interrupted updates. Removing an external organization sets `archivedAt`; it does not cascade-delete schedules, bookings, event types, or profiles. At least one local owner is maintained for every active organization.

Creation is the sole pre-subscription exception: it creates an owner-only provisional organization for
Team checkout. Every other organization mutation evaluates the entitlement of the target organization,
not a Team entitlement inherited from some other membership.

Team billing uses the accepted local membership count as Polar seat quantity. Seat updates are serialized per organization and retried idempotently. If Polar refuses a seat increase, the new member is not activated locally and the user receives a recoverable billing error.

## 9. Polar Catalog and Configuration

Create four recurring sandbox products:

1. `Convenio Pro — Monthly` at $10 per month.
2. `Convenio Pro — Annual` at $96 per year.
3. `Convenio Team — Monthly` at $15 per seat per month.
4. `Convenio Team — Annual` at $144 per seat per year.

Attach stable plan-marker benefits `convenio-pro` and `convenio-team`. Product metadata includes `plan_key` and `billing_interval`. Application code identifies configured products by environment IDs and verifies that webhook metadata agrees with the configured mapping.

Configure the organization with:

- USD default currency.
- Multiple active subscriptions disabled.
- Seven-day benefit-revocation grace period during payment recovery.
- Trial-abuse prevention enabled.
- Customer-portal plan switching disabled.
- Customer-portal seat editing disabled.
- Customer-portal cancellation at period end enabled.
- App-owned plan changes and seat updates.

Create a least-privilege sandbox organization access token and a webhook endpoint. The sandbox token, webhook secret, and product IDs are server-only environment variables. Production receives separate products, identifiers, tokens, and webhook secrets after acceptance; sandbox identifiers are never reused in production.

## 10. Billing Persistence and Interfaces

Introduce:

```ts
type PlanKey = "FREE" | "PRO" | "TEAM";
type BillingInterval = "MONTH" | "YEAR";
type BillingStatus = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID";

type BillingSubject =
  | { type: "USER"; userId: number }
  | { type: "ORGANIZATION"; organizationId: number };
```

`BillingSubscription` stores the subject, stable subject key, plan, interval, status, Polar customer/subscription/product IDs, seat count, period dates, cancellation state, and timestamps. The service layer enforces exactly one matching subject relation.

`ExternalWebhookEvent` stores provider, unique event ID, type, processing state, attempts, timestamps, payload hash, and sanitized error. Raw identity or billing payloads are not retained.

External route handlers:

- `POST /api/webhooks/clerk`
- `POST /api/webhooks/polar`

Authenticated tRPC procedures:

- `viewer.billing.get`
- `viewer.billing.createCheckout`
- `viewer.billing.createPortalSession`
- `viewer.billing.changePlan`
- `viewer.billing.cancelAtPeriodEnd`
- `viewer.billing.reconcile`

Checkout accepts only configured `PlanKey` and `BillingInterval` values. The server resolves the billing subject, verifies ownership/admin authority, computes Team seats, and creates the Polar checkout with:

- `external_customer_id = user:<clerkUserId>` for Pro.
- `external_customer_id = org:<clerkOrganizationId>` for Team.
- Subject and plan metadata.
- Success URL `/settings/billing?checkout_id={CHECKOUT_ID}`.
- Return URL `/pricing`.

The success page displays a pending state and polls the local projection. A redirect never grants an entitlement. The verified Polar `customer.state_changed` event is the primary projection input; an authenticated reconciliation procedure fetches customer state by external ID when delivery is delayed.

## 11. Entitlements

Create a code-defined, exhaustively typed plan matrix. Polar benefits identify the plan; Convenio defines the concrete capabilities.

The entitlement service returns one snapshot containing boolean capabilities and numeric limits. Server mutations enforce the snapshot before changing data. UI checks only improve presentation and are not the security boundary.

Enforcement points include:

- Creating or reactivating event types.
- Connecting additional calendar accounts.
- Enabling recurring or advanced event settings.
- Removing branding.
- Configuring booking-payment integrations.
- Creating API keys or outgoing webhooks.
- Creating organizations, inviting members, or activating membership.
- Creating shared team event types.
- Selecting collective or round-robin scheduling.
- Reading booking audit data.

Downgrades do not delete resources:

- Pro to Free restores branding and blocks new paid-only resources or settings. Existing count overages remain operational, but no additional resource may be created or reactivated until usage is within the Free limit.
- Team expiration archives billing access to the organization. Organization administration and team event types become read-only, shared team booking pages show a plan-inactive state, and personal scheduling continues.
- Reactivation restores access without data migration.

## 12. Webhook Safety and Recovery

Both handlers verify signatures before parsing or mutating data. Each event is claimed through the provider/event unique constraint and processed transactionally. Duplicate delivery returns success without repeating side effects.

Projection handlers use the event's effective timestamp and refuse older lifecycle state from overwriting a newer subscription state. Failed events retain sanitized errors and can be replayed. Checkout return reconciliation and an administrative reconciliation command repair delayed or missed events.

No webhook logs credentials, complete payloads, password material, tokens, payment data, or private Clerk metadata.

## 13. End-to-End Acceptance

Automated Clerk tests use `@clerk/testing`, development testing tokens, `+clerk_test` email addresses, and verification code `424242`. Polar checkout tests use the sandbox and Stripe test card `4242 4242 4242 4242` with a future expiration and arbitrary CVC.

The acceptance run proves:

1. New email/password signup, verification, username creation, and local provisioning.
2. Sign-out, protected-route redirect, password sign-in, and session persistence.
3. Forgotten-password and TOTP enrollment/recovery behavior.
4. One migrated bcrypt user signs in with the unchanged password.
5. Google and Microsoft login link to one local user rather than duplicating it.
6. Organization creation, invitation, acceptance, role update, and member authorization boundaries.
7. Checkout for all four Polar products and verified local entitlement activation.
8. Pro-to-Team change, accepted-member seat increases, member removal, and Polar seat reconciliation.
9. Customer portal access, invoice visibility, payment-method management, and cancellation at period end.
10. Access retention through the paid period and revocation behavior when Polar removes benefits.
11. Invalid signatures, duplicate deliveries, out-of-order events, delayed delivery, and explicit reconciliation.
12. Free, Pro, and Team server-side feature gates, including direct mutation attempts that bypass the UI.
13. Cleanup of tagged Clerk users, test organizations, active test subscriptions, and local records so the suite is repeatable.

Artifacts include Playwright traces on failure, screenshots at authentication/checkout/entitlement transitions, the HTML report, relevant webhook-delivery evidence, and database assertions.

Required verification before cutover:

```bash
yarn biome check --write <changed-files>
TZ=UTC yarn test <targeted-tests>
yarn type-check:ci --force
PLAYWRIGHT_HEADLESS=1 yarn playwright test <clerk-polar-specs> --project=@calcom/web --workers=1
```

## 14. Delivery Decomposition

The program is split into four independently reviewable implementation plans:

1. **Clerk identity and migration:** schema mappings, provider integration, local session adapter, auth UI, user import, rollback, and NextAuth cleanup gate.
2. **Clerk organization synchronization:** organization mapping, invitations, membership roles, archive behavior, and authorization tests.
3. **Polar billing and entitlements:** catalog provisioning, billing persistence, webhooks, checkout, portal, plan changes, seat synchronization, pricing UI, and server gates.
4. **End-to-end cutover:** dashboard configuration, environment setup, full browser acceptance, cleanup, staged enablement, monitoring, rollback rehearsal, and final NextAuth removal after the stability window.

Each implementation slice stays below ten code files and five hundred changed code lines where practical, uses direct source imports, adds translated UI strings, avoids generated-file edits, follows TDD, runs Biome and targeted tests, and runs `yarn type-check:ci --force` before integration.

## 15. Rollout and Completion Criteria

Roll out in this order:

1. Land schema and compatibility infrastructure with NextAuth still active.
2. Configure the Clerk development instance and validate imported test users.
3. Enable Clerk in local and staging environments.
4. Configure the Polar sandbox catalog, token, webhook, and product IDs.
5. Enable billing and entitlements in staging and complete the acceptance suite.
6. Rehearse switching `AUTH_PROVIDER` back to NextAuth.
7. Configure the Clerk production instance and production user import.
8. Enable Clerk for production, observe authentication and provisioning errors, then enable self-serve billing.
9. After thirty stable days, remove NextAuth and local password ownership in a dedicated cleanup change.

The program is complete only when every acceptance scenario passes against the configured Clerk and Polar environments, all required dashboard objects exist, no legacy NextAuth runtime path remains after the stability window, and a requirement-by-requirement audit finds no missing behavior.

## References

- Clerk Auth.js migration: <https://clerk.com/docs/guides/development/migrating/authjs>
- Clerk Playwright testing: <https://clerk.com/docs/guides/development/testing/playwright/overview>
- Polar sandbox: <https://polar.sh/docs/integrate/sandbox>
- Polar checkout sessions: <https://polar.sh/docs/features/checkout/session>
- Polar customer state: <https://polar.sh/docs/integrate/customer-state>
