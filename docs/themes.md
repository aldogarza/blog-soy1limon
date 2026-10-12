# Themes

The public site and the admin share one markup and can wear different themes. Why it works this
way: [ADR 0006](adr/0006-themes-over-semantic-html.md).

| Theme    | Status                                                                   |
| -------- | ------------------------------------------------------------------------ |
| `istyle` | **Active.** iOS-inspired: glass bars, large titles, grouped cards, pills |
| `plain`  | System colours, no decoration; the reference theme                       |

## Choosing and previewing a theme

The active theme is `theme` in `packages/core/src/site-config.ts`. To try another one without
changing it:

```sh
THEME=plain pnpm web       # public site
THEME=plain pnpm admin     # admin
```

An unknown name stops the build with the list of available themes.

## How a theme is built

```
packages/themes/src/
  index.ts              registry (THEMES) and the Astro integration
  foundation/site.css   shared by every theme of the site
  foundation/admin.css  shared by every theme of the admin
  plain/site.css        one folder per theme
  plain/admin.css
  istyle/tokens.css     a theme may split its files freely
  istyle/site.css
  istyle/admin.css
```

Each `site.css` / `admin.css` must import its foundation first. The foundation declares three
cascade layers, in this order:

| Layer        | Contains                                                          | Who writes it |
| ------------ | ----------------------------------------------------------------- | ------------- |
| `foundation` | Box sizing, responsive images, skip-link placement, reflow guards | foundation    |
| `theme`      | Everything visual                                                 | the theme     |
| `a11y`       | Focus outline, `.visually-hidden`, reduced motion                 | foundation    |

`a11y` wins over `theme`, whatever the selector specificity. A theme changes the focus outline only
through these custom properties:

| Property              | Default     |
| --------------------- | ----------- |
| `--focus-ring-color`  | `Highlight` |
| `--focus-ring-width`  | `3px`       |
| `--focus-ring-offset` | `2px`       |

Put every rule of a theme inside `@layer theme { … }` (or import files with `layer(theme)`); rules
outside any layer would beat the `a11y` layer. Do not use `!important` for motion: inside layers it
reverses the order and would beat the reduced-motion guarantee.

## The markup contract

Themes may style any element, ARIA state and the hooks below. Nothing else is guaranteed to stay
stable. Never add a class to a template just to style it: if a design needs a hook, add a semantic
one here first.

### Public site

| Hook                                                                                                                | Element and meaning                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.skip-link`                                                                                                        | First link of every page                                                                                   |
| `.site-header`, `.site-brand`                                                                                       | Page banner and the site name inside it                                                                    |
| `.site-nav`, `.lang-switch`                                                                                         | Main navigation; the item that switches language                                                           |
| `[aria-current="page"]`                                                                                             | The navigation link of the current page                                                                    |
| `.page-intro`                                                                                                       | Introductory paragraph under the home `h1`                                                                 |
| `.post-list`, `.post-card`                                                                                          | List of posts (`ul`) and each post summary (`article`)                                                     |
| `.post`                                                                                                             | The `article` on a post page                                                                               |
| `.post-header`, `.post-meta`                                                                                        | Title block; date and reading time line (also in cards)                                                    |
| `.post-tags`                                                                                                        | Label plus `ul` of tag links (`a[rel="tag"]`)                                                              |
| `.post-translation`                                                                                                 | Link to the post in the other language                                                                     |
| `.post-cover`                                                                                                       | Cover `figure`                                                                                             |
| `.post-body`                                                                                                        | The rendered Markdown (headings start at `h2`, `figure`, `pre.shiki`, tables, blockquotes)                 |
| `.gallery`                                                                                                          | Gallery `section` with an `h2` and a `ul` of `figure`s                                                     |
| `.pagination`                                                                                                       | Pagination `nav`; links carry `rel="prev"` / `rel="next"`                                                  |
| `.tag-index`, `.tag-count`                                                                                          | List of all tags; the post count next to each                                                              |
| `.search-form`, `.search-status`, `.search-results`                                                                 | Search page                                                                                                |
| `.site-footer`                                                                                                      | Page footer (`small` holds the copyright)                                                                  |
| `.lightbox`, `.lightbox-figure`, `.lightbox-image`, `.lightbox-caption`, `.lightbox-position`, `.lightbox-controls` | Gallery viewer `dialog` and its parts (buttons: `.lightbox-previous`, `.lightbox-next`, `.lightbox-close`) |
| `.visually-hidden`                                                                                                  | Text for screen readers only (never restyle)                                                               |

### Admin

| Hook                                                      | Element and meaning                                           |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `.admin-header`, `.admin-brand`, `.admin-nav`             | Banner and main navigation (`aria-current="page"` / `"true"`) |
| `.field`, `.required`, `.hint`                            | A text field wrapper; the "(required)" marker; help text      |
| `.error`, `[aria-invalid="true"]`                         | Error message; an invalid field                               |
| `.error-summary`                                          | Problems list that receives focus after a failed submit       |
| `.warning`                                                | Something worth checking                                      |
| `.actions`, `.toolbar`                                    | A row of buttons; the Markdown formatting buttons             |
| `.grid`, `.plain`                                         | Image grids; lists without bullets                            |
| `.drop-zone`, `.drop-zone.dragging`                       | File drop area and its drag-over state                        |
| `.upload-preview`, `.detail-preview`                      | Large image previews                                          |
| `.gallery-list`, `.gallery-thumb`                         | Reorderable gallery in the post editor                        |
| `.picker`                                                 | Image picker `dialog`                                         |
| `.serp`, `.serp-path`, `.serp-title`, `.serp-description` | Google result preview                                         |
| `.preview`                                                | Post preview (`article`, headings start at `h3`)              |
| `.save-state`                                             | "All changes saved" line                                      |
| `.comparison`, `.diff`                                    | Revision comparison and the body diff (`ins`/`del`)           |
| `.table-scroll`                                           | Scrollable region around wide tables                          |
| `.danger-zone`                                            | Section with destructive actions (deleting)                   |
| `.inline-form`                                            | A one-button form inside a line of text                       |

Native elements to cover in an admin theme: `fieldset`/`legend`, `details`/`summary`,
`dialog` (and `::backdrop`), `meter`, `dl`, `table`, every input type including
`datetime-local`, and buttons in `:disabled` state.

## Adding a theme

1. Create `packages/themes/src/<name>/site.css` and `admin.css`, each starting with
   `@import '../foundation/<site|admin>.css';`.
2. Register it in `THEMES` (`packages/themes/src/index.ts`).
3. Add it to the `theme` matrix of the `admin-e2e` and `web-e2e` jobs in `.github/workflows/ci.yml`.
4. Check it locally: `THEME=<name> pnpm test:e2e` (axe in light and dark mode, keyboard, 320 px
   reflow, Lighthouse).

## Rules for every theme

- Contrast at least 4.5:1 for text and 3:1 for UI components and focus indicators, in light **and**
  dark mode. Prefer `light-dark()` tokens over two separate rule sets.
- Set an explicit background and text colour on the root; tools and some readers assume white
  otherwise.
- No horizontal scrolling at 320 CSS px; wide content scrolls inside its own container.
- Effects such as `backdrop-filter` glass need a solid fallback with enough contrast
  (`@supports not (backdrop-filter: blur(1px))`), and the text on them must still pass contrast.
- Motion only inside `@media (prefers-reduced-motion: no-preference)`.
- No web fonts (system font stacks only), no images for decoration that carry meaning, no content
  added with `::before`/`::after` that a reader would need.
