# SEO, analytics and environments

## Development vs production

`DEPLOY_ENV` (in `apps/web/.env`, or set by the deploy workflow) decides what a build may do:

|                          | `development` (default) | `production` (deploy workflow only)                                           |
| ------------------------ | ----------------------- | ----------------------------------------------------------------------------- |
| `<meta name="robots">`   | `noindex, nofollow`     | `index, follow, max-image-preview:large` (search page and 404 stay `noindex`) |
| `robots.txt`             | `Disallow: /`           | `Allow: /`                                                                    |
| Analytics script         | never rendered          | rendered if `CLOUDFLARE_WEB_ANALYTICS_TOKEN` is set                           |
| Google verification meta | never                   | rendered if `GOOGLE_SITE_VERIFICATION` is set                                 |
| Content source           | fixtures or Supabase    | **must** be Supabase (a production build from fixtures is rejected)           |

Local builds, the dev server, CI and end-to-end tests are all `development`, so they never count a
visit and can never be indexed even if they end up online by mistake.

### Analytics

[Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/) is free, cookieless
(no consent banner needed) and does not track people across sites. The site token is public by
design: it appears in the page source. Create the site in the Cloudflare dashboard and put the
token in the `CLOUDFLARE_WEB_ANALYTICS_TOKEN` repository variable.

**Excluding your own visits on the real site:**

- Open any page once with `?analytics=off`, e.g. `https://<domain>/?analytics=off`. The browser
  remembers it (localStorage) and stops sending visits.
- `?analytics=on` undoes it.
- Do it once on each browser or device you use.

## What every page emits

`src/components/SeoHead.astro`, rendered by `BaseLayout`, emits:

- `<title>` as "Page · soy1limon", a meta description, and an absolute canonical URL (equal to the page URL).
- `hreflang` links when the page has a real equivalent in the other language: homes, tags used in both
  languages, and posts linked as translations.
  - Every version lists all versions, itself included, plus `x-default` pointing to Spanish (the default language).
  - Pages without an equivalent emit none; the language switch then points to the other home.
- Open Graph and Twitter cards.
  - Image: a ≥ 1200 px variant of the post's first photo, with its alt text in the page language.
    Posts without photos use `public/og-default.png` (1200×630).
  - Posts also carry `og:type=article` with published and modified times and tags.
- RSS discovery link for the page language.
- JSON-LD (escaped so content can never close the `<script>` element):
  - Home: `WebSite` with `author`.
  - Posts: `BlogPosting` (headline, description, dates, author `Person`, `inLanguage`, keywords,
    and every photo as `ImageObject`) plus `BreadcrumbList`.
  - Archive and tag pages: `BreadcrumbList`.

### Images in Google Images ("Licensable")

Each `ImageObject` carries `creator`, `creditText` and `copyrightNotice` from the image metadata.
`license` and `acquireLicensePage` are added **only when the image has a license URL**.

To enable the badge:

1. Set `siteConfig.imageDefaults.licenseUrl` to a page explaining how your photos may be used.
2. Re-save the images (or set the license URL per image in the admin).

The same fields are embedded in the image files (see `docs/media-pipeline.md`).

## Sitemap and robots.txt

- `/sitemap.xml` is generated from the content (`src/lib/sitemap.ts`), not by an integration,
  because post slugs differ between languages and the sitemap must pair translations correctly.
  - **Included**: homes, archive pages 2 and later, tag pages, posts. Each has `lastmod` (newest
    post update), `xhtml:link` hreflang pairs, and `image:image` entries for every photo of a post.
  - **Excluded**: search pages, redirect pages (old slugs and the old `/blog/` index), and the 404.
- `/robots.txt` points to the sitemap and only allows crawling in production.

## Google Search Console

1. In Search Console add a **Domain** property for your domain.
2. Verify with the **DNS TXT** record Google shows, added in Cloudflare DNS. This needs nothing in
   the repo. Alternatively set `GOOGLE_SITE_VERIFICATION` to use the meta tag.
3. Submit `https://<domain>/sitemap.xml`.
4. After the first deploy, test one post with the
   [Rich Results Test](https://search.google.com/test/rich-results); it should detect
   `BlogPosting` and `BreadcrumbList`.

## Tests

- **Unit** (`src/lib/seo.test.ts`): hreflang sets, `BlogPosting` and `ImageObject` (license fields
  only with a license URL), breadcrumbs, JSON-LD escaping, social image choice, and sitemap content
  (pairs, images, `lastmod`, exclusions).
- **End to end** (`e2e/site.spec.ts`), on every crawled page:
  - Canonical equals the URL; description and Open Graph tags present.
  - `noindex` and no analytics in test builds; JSON-LD parses.
  - Hreflang links are reciprocal and self-referencing.
  - Every sitemap URL loads and is canonical.
  - `robots.txt` blocks non-production builds.
