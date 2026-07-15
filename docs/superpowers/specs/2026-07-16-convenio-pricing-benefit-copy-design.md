# Convenio Pricing Benefit Copy Design

**Status:** Approved wording on 2026-07-16.

**Scope:** Replace only the three benefit lines shown for each plan on the public and authenticated pricing surfaces. Headlines, plan descriptions, prices, billing cadence, seat explanation, proof line, CTAs, plan ordering, and checkout behavior remain unchanged.

## Copy Decision

Each benefit starts with the concrete capability or limit a person receives, followed by a short explanation of what that means in practice. The wording stays specific to scheduling work and avoids generic sales language or unsupported claims.

### Pro

- **Unlimited event types** — Offer every kind of meeting you run.
- **Connect every calendar** — Only show times that are truly free.
- **Webhooks and API keys** — Send confirmed bookings into the tools that act on them.

### Team

- **Shared event types** — Give the team one set of booking rules.
- **Round-robin and collective scheduling** — Find a time across the right people.
- **Roles and booking history** — Control who can change things and see what happened.

### Free

- **2 active event types** — Publish your two most useful booking links.
- **1 connected calendar** — Keep availability tied to your main calendar.
- **Convenio branding stays on the booking page.**

## Presentation

The capability phrase and explanation remain one readable benefit line in the existing plan cards. The capability phrase may receive stronger typographic emphasis only if the current shared component already supports it without changing card layout or introducing new styling.

## Guardrails

- Do not add trials, discounts, urgency, popularity labels, or customer claims.
- Do not imply that Free includes more than two active event types or more than one connected calendar.
- Do not describe a separate API product; the line refers to the existing API-key and webhook capabilities.
- Do not change plan entitlements, Polar products, checkout, or feature gates.
- Keep all user-facing strings in the English translation catalog and reuse the same keys across public and authenticated pricing.

## Verification

- Update focused pricing component tests to assert the approved benefit copy for Pro, Team, and Free.
- Run the focused pricing test suite and Biome on changed files.
- Verify `/pricing` at desktop and mobile widths in the running local application, including the Free plan inside “View all plans.”
