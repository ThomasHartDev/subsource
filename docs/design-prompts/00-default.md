# Claude Design Prompt — Project Template

Paste the relevant section below into [claude.ai/design](https://claude.ai/design) when starting a design session for this project. Fill in the bracketed bits the first time and the file becomes the project's design contract — every future Claude Design session for this project starts the same way.

---

## Section 1 — Identity (always include)

> I'm working on `[PROJECT NAME]` — `[ONE-LINE DESCRIPTION OF WHAT IT IS, e.g. "an Electron desktop app for managing multi-project development workflows" or "a marketplace for vintage vinyl"]`. Stack: `[NEXT 15 / NUXT 4 / VITE + REACT 19 / SHOPIFY HYDROGEN / etc.]` with `[CSS MODULES / TAILWIND / CSS-IN-JS / VANILLA CSS]` for styling.
>
> The brand color palette uses these CSS variables (from `app/globals.css` or equivalent — replace with actual values):
> - `--color-accent: [HEX]` (primary brand)
> - `--color-background: [HEX]` (page bg)
> - `--color-foreground: [HEX]` (default text)
> - `--color-card-bg: [HEX]`
> - `--color-card-border: [HEX]`
> - `--color-muted-foreground: [HEX]`
>
> Stick to these colors plus reasonable extensions. Don't introduce new accent colors.

## Section 2 — Constraints (always include)

> - **Mobile-first.** Start every layout decision at 375px viewport. Then design tablet (640-1023px) and desktop (1024px+) breakpoints.
> - **Touch targets ≥ 44x44 px** (Apple HIG / WCAG 2.5.5). No tiny icon-only buttons.
> - **Smooth motion.** Plan for Framer Motion entrance animations: stagger parent + fadeUp child variants, easing `[0.21, 0.47, 0.32, 0.98]`, 200-400ms.
> - **Card style baseline.** 16px border-radius cards with `var(--color-card-border)` borders, hover transforms (`translateY(-1px)`), subtle `::before` gradient accent lines, precise typography (`letter-spacing`, `rem`-based sizes).
> - **No emojis** unless I explicitly ask.

## Section 3 — Conversion + UX rules (include for landing pages, marketing sites, public-facing products)

> - **Above the fold matters most.** Headline under 10 words, "[Outcome] without [pain point]" formula. One subheadline. One CTA. Single email field if collecting (multi-field forms cut conversion in half).
> - **CTA copy**: "Get Early Access" or "I Want In", never "Submit" or "Sign Up".
> - **Social proof early.** Live counter ("Join 2,368 others"), logos, founder credentials.
> - **5-7 sections max.** Above fold + 2-3 benefit blocks + social proof + FAQ + repeated CTA.
> - **Page load < 1s** target — keep static, minimal JS. No heavy frameworks on the landing page.
> - **Mobile is 83% of ad traffic.** Thumb-friendly everything.

## Section 4 — What I want designed (rewrite per session)

> Design `[SPECIFIC FEATURE / PAGE / COMPONENT]`. The current state is `[DESCRIBE OR ATTACH SCREENSHOT]`. The improvement I want is `[GOAL]`. Constraints specific to this design: `[ANY ADDITIONAL]`. Generate `[N]` variants if appropriate.

## Section 5 — Handoff prep (always include at end)

> When the design is ready, package it as a Claude Code handoff bundle. I'll save the bundle to `design-bundles/<feature-slug>.json` in the project repo and pass it to Claude Code with: "implement design-bundles/<feature-slug>.json". Include in the bundle:
> - The component tree as nested elements with semantic HTML
> - All CSS variables used (matching my project's existing names)
> - Any new icons (preferring Lucide React icon names where they exist)
> - Animation timing if non-default
> - Per-breakpoint adjustments

---

## Reusing this for future sessions

After your first Claude Design session for this project, save the conversation export. Subsequent sessions can start with: "Same project as my Claude Design session on `[DATE]`, here's the new ask: ..." instead of re-pasting the full template.

The template lives at `~/.claude/templates/design-prompt-template.md` (master) — copies in each project at `docs/design-prompts/00-default.md` are encouraged to be customized with the project's actual color values for one-step pasting.
