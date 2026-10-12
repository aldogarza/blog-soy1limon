# Accessibility

Target: **WCAG 2.2 AA** on the public site and in the admin. Accessibility is a functional
requirement: a change that breaks one of the checks below is a bug, not a styling detail.

## How the site is built for it

- Semantic HTML first: landmarks, one `h1` per page, real lists, tables with captions, `<figure>`
  with `<figcaption>`, native form controls.
- A skip link is the first Tab stop and moves focus to `<main>`.
- Every focusable element shows a 3 px outline (`:focus-visible`), in light and dark mode.
- `<html lang>` follows the post language; mixed-language snippets carry their own `lang`.
- Every image has alt text **in the page language**; the build fails when one is missing.
- Light and dark mode use system colours (`Canvas`, `CanvasText`, `Highlight`), so forced-colour
  modes such as Windows High Contrast keep working.
- Animations are switched off under `prefers-reduced-motion` (there are none yet).
- The public site ships no JavaScript except on the search page, which explains itself and links
  to the archive when scripts are off.
- No audio or video. Any future embed must ship WebVTT captions and a transcript (hearing access).
- Admin forms: labels and hints tied to every input, `aria-invalid` plus an error summary that
  takes focus, live regions for progress and status, and focus moved to each upload step's heading.

## Automated checks (run in CI on every push)

| Check                                                              | Where                                            | WCAG                  |
| ------------------------------------------------------------------ | ------------------------------------------------ | --------------------- |
| axe (WCAG 2.0–2.2 A/AA rules) on every page, light mode            | `apps/web/e2e/site.spec.ts`, admin specs         | many                  |
| axe on every page in **dark mode**                                 | `e2e/quality.spec.ts` (both apps)                | 1.4.3, 1.4.11         |
| No horizontal scrolling at **320 CSS px** (= 400% zoom)            | `e2e/quality.spec.ts` (both apps)                | 1.4.10                |
| Increased text spacing does not cause overflow                     | `apps/web/e2e/quality.spec.ts`                   | 1.4.12                |
| Tab reaches every control, shows a focus outline, is never trapped | `e2e/quality.spec.ts` (both apps)                | 2.1.1, 2.1.2, 2.4.7   |
| The focused control is on screen                                   | `e2e/quality.spec.ts` (both apps)                | 2.4.11                |
| Skip link first, and it moves focus into `<main>`                  | `apps/web/e2e/quality.spec.ts`, admin media spec | 2.4.1                 |
| No running animations with reduced motion                          | `e2e/quality.spec.ts` (both apps)                | 2.3.3                 |
| One `h1`, `lang`, alt text and image dimensions on every page      | `apps/web/e2e/site.spec.ts`                      | 1.1.1, 1.3.1, 3.1.1–2 |
| Every internal link, `#fragment` and referenced file exists        | `apps/web/e2e/quality.spec.ts`                   | —                     |
| Lighthouse budgets on five representative pages                    | `apps/web/e2e/lighthouse.spec.ts`                | —                     |

Lighthouse runs with the default **mobile** profile (slow 4G, mid-range phone). Budgets:
accessibility 100, SEO 100, best practices 100, performance ≥ 95. Test builds always carry
`noindex`, so the crawlability audit is skipped there; it is checked on the live site instead.

## Manual checklist

Automated tools find only part of the problems. Run this list before the styling phase, after it,
and after any big change to the layout.

**Keyboard only** (unplug the mouse):

- [ ] Site: home → post → gallery photo → back → tag → search (type, submit, open a result) → switch
      language. Focus is always visible and moves in reading order.
- [ ] Admin: upload two photos through the whole stepper, create a post, add cover, gallery (reorder
      with Move up / Move down) and an inline image, preview, publish, unpublish.
- [ ] Dialogs (image picker, insert image) open with focus inside, close with Esc and return focus
      to the button that opened them.

**Screen reader** (NVDA + Chrome or Firefox on Windows):

- [ ] Post page: the title is announced as heading level 1; headings list (NVDA+F7) makes sense;
      the language switches to Spanish for a Spanish post (pronunciation changes).
- [ ] Gallery: announced as a region "Gallery" with a list of N items; each photo reads its alt text
      plus "Open the full-size image"; captions are read.
- [ ] Upload stepper: "Image 2 of 5" is announced when moving between steps; progress and the final
      summary are read without moving focus; errors are announced and lead to the field.
- [ ] Post editor: save, autosave and deploy status messages are read once, not repeatedly.

**Zoom and display**:

- [ ] Browser zoom at 200% and 400% on the site and the admin: nothing cut off, no sideways
      scrolling except inside the wide admin tables.
- [ ] Windows High Contrast (Settings → Accessibility → Contrast themes): text, links, focus and
      form borders stay visible.
- [ ] With "reduce motion" on in the operating system, nothing moves.

## Known limitations

- Contrast is verified in Chromium. Light and dark mode use the browser's system colours, which
  differ slightly between browsers; they all pass AA, but the numbers are not identical.
- A gallery photo opens the raw `.webp` file in the browser's image viewer, which has no alt text
  of its own. The link text says what it opens. An accessible lightbox arrives in the styling phase.
- Search needs JavaScript (Pagefind). Without it the page says so and links to the archive.
- Tooling checks that alt text exists, not that it is good. Describing photos well is up to the
  author (the admin shows guidance and a character counter).
- The admin is designed for a desktop screen. Below about 500 px its data tables scroll sideways
  inside their own focusable region, which WCAG allows for data tables.
- The schedule field is the browser's native date-time input. Its screen-reader support depends on
  the browser; NVDA with Chrome or Firefox reads each part (day, month, year, time).
- External links are not fetched in CI (that would make builds fail when another site is down); they
  are only required to be HTTPS.

## Findings log

| Date       | Found                                                                                       | Fix                                                       |
| ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 2026-10-12 | Dark mode: pages had no explicit background, so tools (and some readers) assumed white      | `background-color: Canvas; color: CanvasText` on the root |
| 2026-10-12 | Admin: the calendar button inside the schedule field took focus without a visible ring      | Outline on `input[type='datetime-local']:focus-within`    |
| 2026-10-12 | Admin: the posts, variants and deploys tables made the whole page scroll sideways at 320 px | Tables scroll inside a labelled, focusable region         |
| 2026-10-12 | Live site Lighthouse (mobile): 100 in performance, accessibility, best practices and SEO    | —                                                         |
