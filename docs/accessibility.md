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
- Every page of the public site works without JavaScript. The three enhancements fall back to
  plain links and forms: the header search (opens the search page), "Load more" on the home page
  (opens the next archive page) and the gallery viewer (opens the photo file).
- Header search: a labelled `role="search"` form. Results appear in a panel right after the box
  in the Tab order; the down arrow moves into them, Escape closes the panel and returns to the box,
  and a status message announces the number of results. On phones (iStyle) the box shows as a
  magnifying glass and widens while it has focus.
- "Load more" on the home page: a status message announces each load; the focus moves to the
  first new post after a press. Automatic loading while scrolling stops after three pages so the
  footer stays reachable.
- No audio or video. Any future embed must ship WebVTT captions and a transcript (hearing access).
- Admin forms: labels and hints tied to every input, `aria-invalid` plus an error summary that
  takes focus, live regions for progress and status, and focus moved to each upload step's heading.

## Automated checks (run in CI on every push, once per theme)

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
- [ ] Dialogs (image picker, insert image, the gallery viewer) open with focus inside, close with
      Esc and return focus to the control that opened them.

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
- Without JavaScript, a gallery photo opens the raw `.webp` file in the browser's image viewer,
  which has no alt text of its own. The link text says what it opens.
- Search needs JavaScript (Pagefind). Without it the page says so and links to the home page.
- iStyle draws the site over a background photo. axe cannot measure text over an image (it reports
  those checks as "incomplete", not as passes), so the theme's veil and glass were sized by hand from
  the photo's measured luminance (near-black to white): 70% veil in light mode and 60% in dark mode
  keep text on the photo and on the 60% glass at 4.5:1 or more over the photo's darkest and
  brightest spots. Text straight on the photo only uses the label colours; links there are
  underlined text-coloured links. A new background photo must be checked the same way.
- Tooling checks that alt text exists, not that it is good. Describing photos well is up to the
  author (the admin shows guidance and a character counter).
- The admin is designed for a desktop screen. Below about 500 px its data tables scroll sideways
  inside their own focusable region, which WCAG allows for data tables.
- The schedule field is the browser's native date-time input. Its screen-reader support depends on
  the browser; NVDA with Chrome or Firefox reads each part (day, month, year, time).
- External links are not fetched in CI (that would make builds fail when another site is down); they
  are only required to be HTTPS.

## Findings log

| Date       | Found                                                                                                                                | Fix                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 2026-10-12 | Dark mode: pages had no explicit background, so tools (and some readers) assumed white                                               | `background-color: Canvas; color: CanvasText` on the root                                          |
| 2026-10-12 | Admin: the calendar button inside the schedule field took focus without a visible ring                                               | Outline on `input[type='datetime-local']:focus-within`                                             |
| 2026-10-12 | Admin: the posts, variants and deploys tables made the whole page scroll sideways at 320 px                                          | Tables scroll inside a labelled, focusable region                                                  |
| 2026-10-12 | Semantic review: tags as a comma string, unlabelled tag counts, missing space in the footer                                          | Tags are a labelled list; counts say "posts"; `<small>` copyright                                  |
| 2026-10-12 | Admin: error summary and save state re-announced while typing; static `role="alert"`                                                 | Autosave validates silently; one live region per editor; no alerts on page load                    |
| 2026-10-12 | Admin: errors and live status not tied to their fields; Spanish text without `lang`                                                  | `aria-describedby` for slug, name, body and schedule; `lang` on titles, alt text, options          |
| 2026-10-12 | Admin: preview headings joined the editor outline; Enter in "new tag" saved the post                                                 | Preview starts at `h3`; Enter creates the tag                                                      |
| 2026-10-12 | iStyle: language switch overlapped two nav links on phones (target size, 2.5.8)                                                      | Navigation always gets its own row on phones                                                       |
| 2026-10-12 | iStyle at 60% glass: photos under the bar could drop its text to 4.2:1 and the focus ring to 2.2:1; the search placeholder was 3.4:1 | The bar evens out its backdrop (lifts it in light mode, dims it in dark mode); opaque search field |
| 2026-10-12 | iStyle: a "Load more" button that had focus when posts arrived left the focus behind the new posts                                   | The focus moves to the first new post                                                              |
| 2026-10-12 | iStyle admin: tinted buttons fell to 4.3:1 on hover; diff text was grey on colour                                                    | Lighter hover tint; diff text uses the main label colour                                           |
| 2026-10-12 | Live site Lighthouse (mobile): 100 in performance, accessibility, best practices and SEO                                             | —                                                                                                  |
