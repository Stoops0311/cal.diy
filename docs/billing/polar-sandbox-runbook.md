# Polar sandbox catalog runbook

This runbook manages the Convenio catalog in the Polar sandbox organization `convenio`
(`19d88f15-d13c-4a88-bdc6-8e054e9ef2b4`). The provisioner is hard-locked to
`POLAR_SERVER=sandbox` and never prints access tokens or webhook secrets.

## Desired catalog

| Product | Billing | Price | Trial | Seats | Benefit |
| --- | --- | ---: | ---: | ---: | --- |
| Convenio Pro — Monthly | monthly | $10 USD | 14 days | personal | `convenio-pro` |
| Convenio Pro — Annual | annual | $96 USD | 14 days | personal | `convenio-pro` |
| Convenio Team — Monthly | monthly | $15 USD per seat | 14 days | 1–50 | `convenio-team` |
| Convenio Team — Annual | annual | $144 USD per seat | 14 days | 1–50 | `convenio-team` |

Stable metadata identifies every object. Products use `catalog_key`, `plan_key`, and
`billing_interval`; benefits use `catalog_key`. A product with incompatible plan or interval metadata
causes a hard failure instead of being overwritten. In sandbox only, mutable price drift is corrected
by replacing the active price through Polar's supported product update API.

## Required local environment

Keep these values in `apps/web/.env.local` or the shell secret store; never commit them:

```text
POLAR_SERVER=sandbox
POLAR_ACCESS_TOKEN=...
POLAR_ORGANIZATION_ID=19d88f15-d13c-4a88-bdc6-8e054e9ef2b4
```

The runtime also needs the four product IDs, two benefit IDs, and—after a reachable endpoint exists—
`POLAR_WEBHOOK_SECRET`.

Keep the permanent runtime token least-privileged. Catalog changes require a temporary organization
token with exactly `benefits:read`, `benefits:write`, `products:read`, and `products:write`. Supply that
token only to the apply process; do not save it in `.env.local`. Revoke it in the Polar dashboard as
soon as the apply and verification steps finish.

## Provision and verify

Run from the repository root:

```bash
POLAR_ORGANIZATION_ID=19d88f15-d13c-4a88-bdc6-8e054e9ef2b4 yarn polar:provision-sandbox --dry-run
POLAR_ORGANIZATION_ID=19d88f15-d13c-4a88-bdc6-8e054e9ef2b4 yarn polar:provision-sandbox --apply
POLAR_ORGANIZATION_ID=19d88f15-d13c-4a88-bdc6-8e054e9ef2b4 yarn polar:provision-sandbox --dry-run
```

The first command reports intended changes. Apply prints only environment-variable names and resulting
object IDs. The final dry run must print `No changes required.`

Use the permanent runtime token for both dry runs. Inject the temporary catalog token only for the
middle `--apply` command. After the final no-op result, verify the product IDs are unchanged, both Team
prices have a minimum of one and maximum of 50 seats, and then revoke the temporary token. A writer
token must never remain active after provisioning.

Current sandbox object IDs:

```text
POLAR_PRO_BENEFIT_ID=68b9b997-14e5-4de0-8728-10b96b98e983
POLAR_TEAM_BENEFIT_ID=1fc9bf7a-450b-4b43-b983-80e454b2064a
POLAR_PRO_MONTHLY_PRODUCT_ID=1d47ae5e-3af0-48af-a16a-382de595e5c3
POLAR_PRO_ANNUAL_PRODUCT_ID=fcfb8b65-0cf9-4ef4-bec4-e2af23451a43
POLAR_TEAM_MONTHLY_PRODUCT_ID=3f21b87c-023c-4886-a26f-d363743ab81b
POLAR_TEAM_ANNUAL_PRODUCT_ID=a338ea8d-e6dc-4d19-b424-64b4eefe9cd0
```

## Dashboard-only settings

In Polar sandbox, verify the following under the Convenio organization:

- Default currency is USD.
- Multiple concurrent subscriptions are disabled.
- Subscription revocation has a seven-day grace period.
- Trial abuse prevention is enabled.
- Customer portal plan changes and seat management are disabled; the app owns those operations.
- Period-end cancellation remains available through the app-managed cancellation command.
- The organization access token is scoped only to the catalog, checkout/customer-session,
  subscription, customer-state, and webhook operations used by this integration.

## Webhook activation

Do not create the webhook against `localhost`. Once a stable HTTPS application URL or tunnel exists,
create one Polar sandbox endpoint at:

```text
https://<reachable-host>/api/webhooks/polar
```

Subscribe to `customer.state_changed`, store the signing secret only as `POLAR_WEBHOOK_SECRET`, and
send a test event. A valid event must create a successful `ExternalWebhookEvent` ledger row and update
the local billing projection. Invalid signatures must return 401 without projection, and duplicate
successful event IDs must be acknowledged without a second projection.

After changing catalog or webhook configuration, run the serialized billing E2E suite and retain its
checkout, projection, lifecycle, and entitlement screenshots.
