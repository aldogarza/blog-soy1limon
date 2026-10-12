# Public site

`apps/web` is a static Astro site deployed to GitHub Pages. It ships **no JavaScript** except on
the search page and on posts with a gallery (the photo viewer).

## Running it

```sh
pnpm web                                # dev server on http://localhost:4321
pnpm --filter @soy1limon/web build      # astro build + Pagefind index into apps/web/dist
pnpm test:e2e:web                       # build from fixtures and test it in Chromium
```

`apps/web/.env` (see `.env.example`):

- `CONTENT_SOURCE=fixtures` builds offline from `packages/db/fixtures/published-content.json` and the
  sample images in `public/fixtures-media/`. It is used by pull-request CI and works without credentials.
- `CONTENT_SOURCE=supabase` reads published content with the **publishable** key. It also needs
  `MEDIA_BASE_URL`, the R2 custom domain. The sample images are removed from such builds.

## URLs

English is the default language and has no prefix; Spanish lives under `/es/`. All paths come
from `packages/core/src/routes.ts`, shared with the admin.

| Page                          | English                        | Spanish                           |
| ----------------------------- | ------------------------------ | --------------------------------- |
| Home                          | `/`                            | `/es/`                            |
| Archive (10 per page)         | `/blog/`, `/blog/page/2/`      | `/es/blog/`, `/es/blog/page/2/`   |
| Post                          | `/blog/<slug>/`                | `/es/blog/<slug>/`                |
| Old address of a renamed post | `/blog/<old-slug>/` → redirect | `/es/blog/<old-slug>/` → redirect |
| Tags / one tag                | `/tags/`, `/tags/<tag>/`       | `/es/tags/`, `/es/tags/<tag>/`    |
| Search                        | `/search/`                     | `/es/search/`                     |
| RSS                           | `/rss.xml`                     | `/es/rss.xml`                     |
| Not found                     | `/404.html` (bilingual)        | —                                 |

A tag page exists in a language only if that language has posts with the tag.

GitHub Pages cannot send HTTP redirects, so an old address is a tiny page with these elements:

- an instant `<meta http-equiv="refresh">`;
- a canonical link to the new address;
- `noindex`.

## How content becomes pages

`src/lib/content.ts` loads the published content once per build, through `loadPublishedContent`
from `packages/db`:

- Each body is rendered with the shared Markdown pipeline (`packages/markdown`).
- Covers, galleries and translations are resolved.
- The build **fails** with a list of problems if any published post references a missing image or
  lacks alt text in its language. A broken page is never deployed.

This is a plain build-time module, not an Astro Content Layer loader. The content needs custom
rendering (image references resolved per language), and a single cached module keeps that logic
in one testable place.

## Post pages

- **Header**:
  - A single `h1`, then the publish date (and the updated date when it differs) in the site's time
    zone (`America/Monterrey`), so UTC builds never shift the day.
  - Reading time, tag links (`rel="tag"`), and a link to the translation with `hreflang` and `lang`.
- **Cover**: `fetchpriority="high"` and eager loading (it is the largest element on screen).
  Inline and gallery images load lazily.
- **Images**: every one has `srcset`, `sizes`, `width` and `height` (no layout shift) and alt text
  in the post language.
- **Gallery**: a list of figures; each photo links to its largest file and has an optional caption.

## Search

[Pagefind](https://pagefind.app) indexes only post bodies (`data-pagefind-body`) after the build.
It creates one index per `<html lang>`, so English search only finds English posts and vice versa.

- The search page is a plain form plus a small script with live result counts. It also reads `?q=`
  so results can be linked.
- Without JavaScript it explains why and links to the archive.

## Gallery viewer

Gallery photos are plain links to the largest file. A small script in `Gallery.astro` upgrades
them: a click opens the photo in a modal `<dialog>` (focus stays inside, Esc closes and returns
focus to the photo, arrow keys and Previous/Next move between photos, the position is announced).
Without JavaScript, or with Ctrl/Cmd-click, the link opens the file as before. Themes style it
through the `.lightbox*` hooks.

## Tests

`e2e/site.spec.ts` builds from fixtures, serves `dist` with a tiny GitHub-Pages-like server
(`e2e/serve.mjs`), and then checks:

- Every page reachable from the two home pages loads, with the right `lang`, exactly one `h1`, alt
  text and dimensions on every image, no scripts outside search and gallery pages, and **no axe violations (WCAG 2.2 AA)**.
- Every referenced image file exists.
- Covers, inline images, galleries, translations, the old-address redirect, per-language search,
  the 404 page and both RSS feeds behave as described above.

`e2e/quality.spec.ts` adds the automated part of the quality pass (dark mode, 320 px reflow, text
spacing, keyboard, reduced motion, internal links and fragments), and `e2e/lighthouse.spec.ts`
enforces the Lighthouse budgets. Details in [accessibility](accessibility.md).
