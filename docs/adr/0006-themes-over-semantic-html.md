# 0006 — Interchangeable themes over semantic HTML

- Status: accepted
- Date: 2026-10-12

## Context

The site should support more than one visual style, starting with **iStyle** (iOS-inspired: glass
bars, grouped lists, rounded cards). The markup is already semantic and accessible, and every page
is tested for WCAG 2.2 AA. A style must never be able to undo that, and changing the style should
not mean rewriting templates.

## Decision

- A theme is a pair of stylesheets in `packages/themes/src/<name>/`: `site.css` for the public
  site and `admin.css` for the admin. The markup is the same for every theme.
- Themes style **elements, ARIA states and a short list of semantic class hooks**
  ([themes](../themes.md#the-markup-contract)). Templates never carry presentational classes.
- `siteConfig.theme` picks the theme at build time; `THEME=<name>` overrides it for a preview. An
  Astro integration injects only that theme's CSS, so visitors download one theme.
- Each stylesheet starts from a shared **foundation** and uses cascade layers:
  `foundation` → `theme` → `a11y`. The `a11y` layer comes last, so the focus outline, the
  screen-reader-only helper and reduced motion cannot be overridden by a theme; a theme adjusts them
  only through `--focus-ring-*` custom properties.
- CI runs the full end-to-end suite (axe in light and dark mode, keyboard, reflow, Lighthouse) once
  per theme.

## Alternatives considered

- **Tailwind utility classes in the markup** (the original plan for the styling phase): fast to
  write, but the classes describe one look, so a second theme means editing every template. A theme
  may still use Tailwind internally (for its tokens and `@apply` on the hooks) without touching the
  markup.
- **Runtime theme switching for visitors**: possible later (the stylesheets are already isolated),
  but it costs JavaScript, a stored preference and shipping every theme. Not needed now.
- **One stylesheet with variables only**: enough for colours, not for structural differences such
  as glass bars or grouped lists.

## Consequences

- A new theme is a folder plus a line in the registry and in the CI matrix; no template changes.
- If a design needs a hook that does not exist, the hook is added to the markup and the contract,
  never a styling class.
- Themes cannot remove accessibility guarantees, but they can still pick poor colours: the per-theme
  CI run catches contrast problems.
