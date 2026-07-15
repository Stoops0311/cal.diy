# Convenio — App Rehaul Direction

**Status:** Working direction for the authenticated app rehaul (2026-07-14).
**Extends:** `2026-07-13-convenio-brand-voice-design.md`, root `PRODUCT.md`, root `DESIGN.md`.
**Scope:** Authenticated surfaces only (event types, bookings, availability, apps, settings, onboarding-adjacent). Booker and marketing pages are out of scope here.

## Thesis

The app today is a competent generic SaaS shell: left sidebar, gray canvas, cards. Convenio's structural idea is two planes arriving at one decision. The rehaul makes that literal in the shell itself:

- **The canvas** is one plane: paper in light, night in dark. It holds the work.
- **The dock** is the opposing plane: a floating ink pill in light mode, a floating paper pill in dark mode. It holds the navigation.

Navigation stops being a wall of furniture on the left and becomes a small, decisive object the user summons. The working canvas gets the full width of the screen.

## 1. The Dock

One component replaces both the desktop sidebar and the mobile bottom tab bar.

**Geometry**
- Fixed, bottom-centered: `bottom: max(16px, env(safe-area-inset-bottom))`, horizontally centered, `z-index` above content, below dialogs.
- Pill: `border-radius: 999px`, height 56px (44px+ touch targets inside), padding 6px, items are 44×44 rounded-full buttons.
- Floating shadow is earned (it overlaps the canvas): use the dialog "floating" shadow, plus a 1px hairline in the dock's own plane color mix so it reads crisp on same-tone content.

**Plane (the signature)**
- Light theme: `bg` near-ink (`--cal-bg-inverted`), icons/labels paper.
- Dark theme: `bg` near-paper, icons/labels ink.
- Active destination: a solid counter-pill inside the dock (paper pill w/ ink icon in light; ink pill w/ paper icon in dark). Contrast and weight, never a colored stripe. The dock and its active item are mirror images: the whole navigation is one inversion inside another.

**Contents (left → right)**
1. Convenio mark (two converging arcs) — links to `/event-types`. This is the one place in the shell the mark lives.
2. Hairline divider (vertical, 1px, 40% opacity).
3. Primary destinations: Event types, Bookings (with unconfirmed badge), Availability, Apps. Icon buttons; label appears in a tooltip above the dock (`side="top"`).
4. Hairline divider.
5. Search (KBar trigger, shows ⌘K in tooltip).
6. Overflow "more" (opens upward menu): View public page, Copy public link, Refer (flagged), Settings.
7. User avatar (opens upward user dropdown; org avatar when in an org).

**Behavior**
- Rest: fully visible. On scroll down past a threshold the dock recedes to a semi-hidden state (translateY so ~14px peeks); scroll up, hover, focus-within, or `⌘K` restores it. 200ms ease-out-quart. `prefers-reduced-motion`: no recede, no scale, opacity only.
- Hover magnification: restrained Mac nod — hovered icon scales to 1.12, immediate neighbors 1.04. Transform only (no layout animation). Skipped entirely under reduced motion and on coarse pointers.
- Keyboard: it's a `<nav aria-label="Primary">`; every item tabbable, 2px high-contrast focus ring offset against the dock plane. The recede state never hides focus: focus-within pins the dock visible.
- Mobile (<md): same component, full destinations, edge margins 12px; the old separate MobileNavigation is retired. Tooltips off; labels stay icon-only (they already are today on mobile).
- Content clearance: main container gets `padding-bottom: 96px` so the dock never sits on interactive content; `scroll-padding-bottom` likewise.

**What dies**
- `SideBar.tsx` (desktop sidebar) usage in the default shell.
- `MobileNavigation` bottom bar.
- The `TopNav` mobile top bar stays only if something (user menu on small screens) has no home; goal is to retire it too since the dock carries the avatar.

## 2. The Masthead (page header system)

With the left rail gone, pages own the full width. Every main page gets the same masthead grammar:

- **Eyebrow:** small uppercase letter-spaced mono label naming the surface (e.g. `SCHEDULES`, `AGREEMENTS`), 11px, `--cal-text-subtle`. Terse, one word where possible.
- **Title:** `font-cal` (Archivo) bold, 24–30px, tight tracking. Real hierarchy jump from body (≥1.25 scale contrast).
- **Meta/subtitle:** one quiet sentence max.
- **Actions:** right-aligned; one primary pill, everything else ghost/hairline.
- Below the masthead: a full-width 1px hairline, then content. No card wrapping the whole page.
- Content column: `max-width` ~1176px centered, denser surfaces (tables) may go wider.

## 3. Canvas discipline

- Flat by default. Hairlines and tonal planes separate regions; shadows only on floating UI (dock, menus, dialogs).
- Lists (event types, bookings, schedules) are **rows with hairline dividers**, not card grids. Row hover = `--cal-bg-muted` tint, no lift.
- Numbered or counted metadata (durations, slots, party counts) renders in the mono label face: this is where the "technical" register lives day-to-day.
- Empty states teach: eyebrow + one declarative sentence + one primary action. The convergence mark may appear at true zero-state entry only.
- Semantic color only for status (pending/confirmed/error). Everything else stays monochrome.

## 4. Motion budget

- 150–250ms, exponential ease-out. State changes only: dock recede/restore, menu open, row hover, toast.
- No page-load choreography. No decorative motion.

## 5. Rollout order

1. Dock component + shell rewiring (kill sidebar + mobile nav) — structural.
2. Masthead pass on the four main pages (event-types, bookings, availability, apps).
3. Audit-driven polish batches: settings tree, dialogs/forms, empty/loading states, auth-adjacent leftovers.
4. Full-app verification in both themes, keyboard, reduced motion.

## Open questions deferred

- Whether `TopNav` on mobile survives (default: no).
- Settings navigation (its own left rail today) inherits the masthead grammar but keeps a local rail for now; converting settings nav to dock sub-navigation is a later decision.
