---
name: Convenio
description: Two parties, arriving at the same time, on purpose.
colors:
  ink: "#0A0A0A"
  paper: "#FFFFFF"
  night: "#050505"
  fog: "#F2F2F2"
  graphite: "#151515"
  ash: "#6B6B6B"
  smoke: "#9A9A9A"
  hairline-light: "#DDDDDD"
  hairline-dark: "#292929"
typography:
  display:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "clamp(2.75rem, 7vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.18em"
rounded:
  sm: "6px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
  12: "48px"
  16: "64px"
  24: "96px"
components:
  button-primary-light:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "40px"
  button-primary-dark:
    backgroundColor: "{colors.fog}"
    textColor: "{colors.night}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "40px"
  input-dark:
    backgroundColor: "{colors.night}"
    textColor: "{colors.fog}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "36px"
  dialog-dark:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.fog}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Convenio

## Overview

**Creative North Star: "The Convergence Plane"**

Convenio is built from two opposing planes that arrive at one decision. Ink and paper represent the parties without assigning either one dominance. A screen may begin split, paired, or sequential, but it resolves through one shared action or one confirmed record.

The product is geometric, technical, and calm. Marketing may enlarge the thesis; authenticated tools stay compact and familiar. The yin-yang idea is structural, never a literal symbol pasted onto a surface. Layout, copy, and state transitions carry the meaning.

**Key Characteristics:**

- Strict monochrome brand surfaces with semantic color reserved for status.
- True light/dark mirror parity.
- Bold geometric display type paired with quiet product text and technical metadata.
- Tight internal groupings separated by generous rhythm.
- One convergence gesture at meaningful entry, decision, or completion moments.

## Colors

The palette is pure monochrome: ink, paper, and a small neutral ladder create hierarchy without a brand accent.

### Primary

- **Ink:** the light-theme action, display, and mark color.
- **Paper:** the light-theme canvas and dark-theme primary action color.

### Neutral

- **Night:** the first-class dark canvas.
- **Fog:** the first-class dark foreground.
- **Graphite:** the raised dark surface for dialogs, popovers, and bounded task areas.
- **Ash and Smoke:** secondary text roles in light and dark contexts.
- **Hairline Light and Hairline Dark:** structural separators and control borders.

**The Mirror Rule.** A dark theme is not a dimmed light theme. Every foreground/background relationship inverts deliberately.

**The Semantic Exception Rule.** Error, warning, success, and information colors may appear only when they communicate state. Red is never a Convenio accent.

## Typography

**Display Font:** Archivo (with Arial fallback)
**Body Font:** Inter (with system UI fallback)
**Label/Mono Font:** Azeret Mono (with UI monospace fallback)

**Character:** Archivo gives statements geometric authority. Inter keeps dense scheduling work familiar. Azeret Mono gives metadata a technical register without making the whole product look like a terminal.

### Hierarchy

- **Display** (700, fluid 44–88px, 1.02): marketing theses and rare celebratory statements.
- **Headline** (700, 24–30px, 1.1): auth, onboarding, and major product moments.
- **Title** (700, 18–20px, 1.2): page titles, dialog titles, and grouped task headings.
- **Body** (400, 14–17px, 1.5–1.65): product instructions and prose, capped at 65–75 characters where continuous reading matters.
- **Label** (500, 11px, 0.18em tracking, uppercase): metadata, sequence markers, and terse eyebrows only.

**The Two-Register Rule.** Display type states the brand. Product type completes the task. Never put display styling on ordinary labels, fields, tables, or buttons.

## Elevation

Convenio is flat by default. Depth comes first from opposing tonal planes and hairline boundaries. Shadows are reserved for floating UI such as dialogs, menus, and popovers; they must never be used to make every card feel important.

### Shadow Vocabulary

- **Floating:** `0 20px 25px -5px rgb(0 0 0 / 0.18), 0 8px 10px -6px rgb(0 0 0 / 0.14)` for dialogs only.
- **Control Lift:** `0 1px 2px rgb(0 0 0 / 0.08)` for primary buttons and focused floating controls.

**The Earned Lift Rule.** If an element does not overlap another plane, it does not receive a floating shadow.

## Components

### Buttons

- **Shape:** decisive pill geometry (999px radius), reserved for actions.
- **Primary:** solid inverted ink/paper treatment with a 40px visual height and a 44px coarse-pointer target.
- **Hover / Focus:** hover changes tone, never opacity alone; focus uses a two-pixel high-contrast ring with visible offset.
- **Secondary / Ghost:** transparent with a hairline border. Destructive actions retain semantic red text or fill.

### Chips

- **Style:** compact metadata, quiet neutral fill, and short content.
- **State:** selected chips invert; unselected chips remain transparent or softly raised.

### Cards / Containers

- **Corner Style:** restrained 12–16px radii on true bounded tasks.
- **Background:** use base, raised, or inverted planes. Do not create a new gray for every card.
- **Shadow Strategy:** flat at rest; floating shadow only for overlapping UI.
- **Border:** one-pixel hairline.
- **Internal Padding:** 16–32px chosen by content density, never one universal value.

### Inputs / Fields

- **Style:** quiet six-pixel radius, one-pixel border, 36–40px height, labels outside the control.
- **Focus:** high-contrast border plus focus ring; placeholder text never substitutes for a programmatic label.
- **Error / Disabled:** error combines icon, text, and semantic color; disabled controls keep readable labels and visibly reduced affordance.

### Navigation

Authenticated navigation is a distinct plane from the working canvas. Active destinations use contrast and weight, not a colored stripe. Mobile navigation preserves the same vocabulary without shrinking touch targets below 44px.

### Convergence Mark

The two arcs draw toward one point. Use it at brand entry, onboarding resolution, or confirmation. Do not repeat it in every empty state, card, or toolbar.

## Do's and Don'ts

### Do:

- **Do** show the two parties through paired planes, terms versus choices, or before versus confirmed states.
- **Do** use the shared 4–96px spacing ladder and vary rhythm by hierarchy.
- **Do** give every dialog a clear title zone, content zone, and action zone.
- **Do** retain familiar scheduling controls and semantic status colors.
- **Do** verify every surface in both themes, at mobile width, by keyboard, and with reduced motion.

### Don't:

- **Don't** use generic SaaS surfaces that could belong to any productivity tool.
- **Don't** ship Cal.diy naming, copy, illustrations, or residual links as Convenio.
- **Don't** use accent-led branding, gradients, decorative red, or color without semantic meaning.
- **Don't** use literal yin-yang symbols, handshakes, treaties, or repeated agreement metaphors as decoration.
- **Don't** use editorial-serif styling, glassmorphism, identical card grids, nested cards, or shadows to manufacture hierarchy.
- **Don't** use side-stripe borders, gradient text, or modal-on-modal stacking.
- **Don't** hide field labels in placeholders or rely on color alone for state.
