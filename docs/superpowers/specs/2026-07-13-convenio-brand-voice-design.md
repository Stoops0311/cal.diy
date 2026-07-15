# Convenio — Brand Voice & Visual Direction

**Status:** Approved by user, ready for a rebranding agent to execute.
**Scope:** Naming, voice, and visual identity only. No code/product differentiation decided yet — this is currently a whitelabel rebrand of the Cal.diy scheduling product under a new name and identity. Feature/positioning work is a separate, later decision.

## Name

**Convenio**
Pronunciation: **kən-VEE-nee-oh** (stress on "VEE" — deliberately patterned to read like "con-VENE" + "-io" so English speakers land close without a pronunciation guide).

From Latin *convenire* — "to come together, to agree." Root of convene, convention, covenant. Chosen because the literal meaning of the word *is* the product action: a booking is two calendars agreeing to the same time.

Ruled out during naming:
- **Procura** — collides with an existing home-health scheduling platform (AlayaCare's Procura), same category.
- **Horarium** — collides with horarium.ai, an existing school-timetabling SaaS, same category.
- **Concordia** — collides with Concordia University, too strong an existing institutional association.
- **Pactum** — collides with Pactum AI, a funded enterprise negotiation startup, adjacent B2B space.
- **Sponsio**, **Fides**, **Punctum** — each collides with existing funded software/apps.
- **Statio**, **Vocatio**, **Tabella**, **Cursus**, **Coetus** — clean alternatives considered and set aside in favor of Convenio's more direct metaphor.

## Voice Principles

Manifesto-grade register — short, declarative, editorial. Modeled after the tone of Nuncia's manifesto (a reference brand, unrelated product, shared purely for voice calibration).

- Short declarative sentences. Subject-verb-object. No hedging, no "we believe."
- State things in the present tense as fact, not aspiration: "A meeting is an agreement," never "We think meetings should be agreements."
- Never use marketing verbs: no "unlock," "empower," "leverage," "seamless," "streamline."
- One idea per sentence, one metaphor per section — never stack two metaphors.
- Etymology is the closing argument, not the opener. Earn the meaning before explaining it (structure: observation → refusal/problem → the product's stance → the name, last).
- Headlines can use terse parallel structure for product marketing copy (e.g. "Not software you adapt to. Software that adapts to you." — style reference from atlasmanagement.tech), but manifesto/about copy stays closer to the declarative register above.

## Manifesto (draft, approved)

> **A meeting is an agreement.**
>
> Before there was software for it, arranging a meeting meant a call, a counter-offer, a time neither person had quite wanted, settled on because both could live with it. Small, but a treaty. Two calendars, briefly in accord.
>
> Then scheduling became a funnel. A link, a slot, a click. The agreement disappeared into the interface — replaced by availability, which is not the same thing as consent. They call the moment before a booking "friction" and spend their effort removing it, when friction was often the only evidence that a person had actually decided something.
>
> Convenio treats a booking as what it always was: two parties, arriving at the same time, on purpose.
>
> The name comes from *convenire* — Latin for "to come together, to agree." Not to be scheduled. Not to convert. To convene.

## Visual Direction

Reference: atlasmanagement.tech (screenshots reviewed) — geometric/technical dark-console aesthetic. Adopt the geometric and technical visual language from this reference; do not adopt any "ledger/treaty" object framing or a red accent (see below).

**Color** — Monochrome. Pure black/white system, no accent color. Full parity between light and dark themes — dark mode is not "dimmed light mode," both are designed as first-class, mirror-image systems (black-on-white / white-on-black).
- Red was considered and rejected: reads as error/destructive state, fights the calm-authority tone.
- Brass/gold, cobalt blue, and teal were proposed as accent alternatives and also rejected in favor of staying fully monochrome.
- Interactive elements (buttons, links) should use inverted solid pills (black bg / white text in light mode, white bg / black text in dark mode) rather than a brand accent color.

**Typography**
- Headlines: bold, large, geometric sans-serif (Atlas-reference register — not a literary serif).
- Eyebrow labels / metadata: small, uppercase, letter-spaced monospace or grotesk (e.g. "TWO PARTIES. ONE TIME.").

**Layout habits** (from reference)
- Numbered feature rows (01 / 02 / 03) with thin hairline dividers.
- Terse, parallel-structure headlines for marketing sections.
- Sparse, restrained decorative elements — avoid clutter.

**Mark**
- A mark of two arcs converging to a single point — visual literalization of "coming together" without a literal handshake icon. Renders in pure black (light mode) or pure white (dark mode); no color needed.

## Handoff Notes

This document is a brand brief for a rebranding agent to execute against (naming, voice, visual system). It does not cover:
- Actual codebase rename (package names, env vars, DB references — see CLAUDE.md's "Schema changes" and "Changes affecting multiple packages" ask-first boundaries when that work starts).
- Logo file production, exact type family selection, or a full color-token spec (grays, hairline colors, etc.) — left to the executing agent/designer to finalize within the monochrome constraint above.
- Product positioning/differentiation — explicitly undecided as of this doc.
