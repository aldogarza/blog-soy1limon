# Public site

`apps/web` is a static Astro site deployed to GitHub Pages. Every page works without JavaScript;
small scripts only enhance three things, each with a plain fallback:

- **Search box in the header**: results appear under the bar while typing. Pagefind is downloaded
  only when the box gets focus. Without scripts, the form opens the search page.
- **Home page archive**: more posts load in place (see below). Without scripts, the "Load more"
  link opens the next archive page.
- **Gallery viewer** on posts with a gallery. Without scripts, each photo links to its file.

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

Spanish is the default language and has no prefix; English lives under `/en/`. All paths come
from `packages/core/src/routes.ts` (the prefix rule is `DEFAULT_LOCALE` in
`packages/core/src/locales.ts`), shared with the admin.

| Page                          | Spanish                                | English                           |
| ----------------------------- | -------------------------------------- | --------------------------------- |
| Home                          | `/`                                    | `/en/`                            |
| Archive, page 2 and later     | `/page/2/`                             | `/en/page/2/`                     |
| Post                          | `/blog/<slug>/`                        | `/en/blog/<slug>/`                |
| Old address of a renamed post | `/blog/<old-slug>/` → redirect         | `/en/blog/<old-slug>/` → redirect |
| One tag                       | `/tags/<tag>/`                         | `/en/tags/<tag>/`                 |
| Search results (`?q=`)        | `/search/`                             | `/en/search/`                     |
| Old blog index                | `/blog/` → redirect to `/`             | `/en/blog/` → redirect to `/en/`  |
| RSS                           | `/rss.xml`                             | `/en/rss.xml`                     |
| Not found                     | `/404.html` (bilingual, Spanish first) | —                                 |

A tag page exists in a language only if that language has posts with the tag. There is no list of
all tags: tags are reached from the posts that use them.

## Home page and archive

The home page is also the start of the list of every post:

1. **Latest posts**: the newest `siteConfig.blog.recentPosts` (3); the first one is featured.
2. **More posts**: the next `siteConfig.blog.postsPerPage` (12). Below them, a "Load more"
   button fetches the next archive page (`/page/N/`) and appends its posts. Moving the focus or
   scrolling near the end loads the next page on its own, at most three times, so the footer stays
   reachable; after that the button loads on demand.

Accessibility of the loading: a status message announces how many posts arrived, a press moves the
focus to the first new post, and so does a load that finishes while the button has focus.

`/page/N/` pages are complete pages (with previous/next links) for crawlers and visitors without
JavaScript, and they are in the sitemap. `POSTS_PER_PAGE` overrides the page size for tests and
previews, so the sixteen sample posts span several pages.

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
- **Post cards** (home, archive, tags) show the post's cover with empty alt: the title next to it
  already names the card, so screen readers do not hear the photo twice. The first card's cover
  loads eagerly.
- **Gallery**: a list of figures; each photo links to its largest file and has an optional caption.

## Search

[Pagefind](https://pagefind.app) indexes only post bodies (`data-pagefind-body`) after the build.
It creates one index per `<html lang>`, so English search only finds English posts and vice versa.

- The search box lives in the header of every page (`Header.astro`): up to six results appear in
  a panel while typing, and Enter opens the search page with every result.
- The search page (`/search/?q=`) shows up to 20 results for the query and keeps it in the header
  box, so results can be linked and refined.
- Without JavaScript the search page explains why and links to the home page.

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
  text (empty only on card covers) and dimensions on every image, and **no axe violations (WCAG 2.2 AA)**.
- Every referenced image file exists.
- Covers, inline images, galleries, translations, the old-address redirects, the header search
  (keyboard, per-language results, the phone magnifying glass), loading more posts on the home page,
  the same features without JavaScript, the 404 page and both RSS feeds behave as described above.

`e2e/quality.spec.ts` adds the automated part of the quality pass (dark mode, 320 px reflow, text
spacing, keyboard, reduced motion, internal links and fragments), and `e2e/lighthouse.spec.ts`
enforces the Lighthouse budgets. Details in [accessibility](accessibility.md).
