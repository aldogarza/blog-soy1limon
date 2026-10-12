# blog-soy1limon — Implementation Plan

## Context

Aldo wants a **personal public blog that costs $0 to run** (only the domain he already owns). Requirements gathered in conversation:

- Public site: **static**, hosted on **GitHub Pages**, **public repository** (no secrets may ever land in git).
- Images on **Cloudflare R2** (free egress) to minimize transfer.
- A **private admin panel that runs only on Aldo's machine (localhost)** to write posts and upload images.
- Content (posts, drafts, image metadata, revisions) stored in **Supabase (Postgres)** so drafts never appear in the public repo.
- Image pipeline: any input format → **WebP in multiple widths**, optional **watermark**, **correct embedded metadata** (EXIF/XMP) when a visitor downloads the image, **per-image metadata form prefilled from the file**, editable/removable fields, **SEO file name**, processed **one image at a time** for multi-image uploads.
- Posts may have **zero, one or many images**; full **SEO** (Google indexing done right).
- **Accessibility** (WCAG 2.2 AA) for both visual and hearing disabilities, in public site and admin.
- **Everything in the project is English** (code, comments, docs, commits, UI strings of the codebase). **Post content may be Spanish or English.**
- **iOS-like design with Tailwind CSS — deliberately the LAST phase.** Earlier phases focus on functionality with semantic, unstyled-but-accessible HTML.
- Approved extras: keep originals in R2, local media CLI, metadata versioning, strict TypeScript, Turborepo monorepo.

Location: `/home/aldogarza/claude/blog-soy1limon` (empty, to be created). Host has Node 24, pnpm 11, bun, Docker (Docker Desktop via WSL), git.

### Removed from the previous draft (and why)
| Removed | Why |
|---|---|
| Express API on Vercel/Railway | Admin is local; Astro server endpoints/Actions replace it. Railway has no free tier; Vercel caps bodies at 4.5 MB. |
| Rate limiting, Redis, Bull queue | Nothing is exposed to the internet; processing runs in-process locally. |
| `users` table, password hashes, MFA, JWT | No login: the admin only binds to loopback. Supabase Auth sign-ups are disabled. |
| Analytics tables, `view_count` | A static site cannot record views; out of scope. |
| Audit triggers, webhooks table | Replaced by a simple `revisions` table written by the app. |
| `meta_keywords` | Ignored by Google. |
| Backups to S3/Glacier | Costs money; replaced by a local `db:backup` command. |
| React SPA, Zustand, TanStack Query | Admin is Astro + islands. |
| JPEG fallback for WebP | WebP is universally supported. |
| Full-text search in Postgres (`spanish`) | Static search with Pagefind instead (zero server). |

### Added (was missing)
Per-image control of GPS/device/time (kept by default for travel photos; one switch removes all three) · warning when the author's name appears in metadata · HEIC/HEIF (iPhone) support · RLS + column grants + sign-ups disabled · localhost hardening (Host/Origin checks) · Supabase free-tier pause mitigation · scheduled posts · i18n (`en`/`es`) with `hreflang` · alt text per language · IPTC "alt text accessibility" + image license metadata and structured data (Google Images "Licensable") · image sitemap · slug redirects for changed URLs · fixtures mode so PR CI needs no secrets · secret scanning (gitleaks + GitHub push protection) · captions/transcript rule for any future audio/video · automated axe accessibility tests.

---

## Architecture

```
 Aldo's PC (localhost only)                     Cloud (free tiers)
┌──────────────────────────────┐   secret key   ┌──────────────────────┐
│ apps/admin (Astro SSR, Node) │──────────────▶ │ Supabase Postgres    │
│  - Vue islands for forms     │                │  posts, tags, images,│
│  - packages/media (Sharp +   │                │  revisions (RLS on)  │
│    exiftool) runs in-process │                └─────────▲────────────┘
│                              │  S3 API                  │ publishable key
│                              │──────────────▶ ┌─────────┴────────────┐
│                              │                │ R2 bucket "media"    │──▶ img.<domain> (Cloudflare cache)
│                              │                │ R2 bucket "originals"│    (private, never public)
│                              │ repository_    └──────────────────────┘
│                              │ dispatch       ┌──────────────────────┐
│                              │──────────────▶ │ GitHub Actions       │
└──────────────────────────────┘                │ build apps/web       │──▶ GitHub Pages  <domain>
                                                │ (reads published     │
                                                │  content via RLS)    │
                                                └──────────────────────┘
```

Flow: write/upload in admin → saved to Supabase / variants to R2 → **Publish** triggers `repository_dispatch` → workflow builds the static site from published rows → deploys to Pages. A **daily cron build** publishes scheduled posts and keeps the free Supabase project from pausing.

### Monorepo layout (pnpm workspaces + Turborepo)
```
blog-soy1limon/
├─ apps/
│  ├─ web/        # Astro static public site (GitHub Pages)
│  └─ admin/      # Astro SSR (@astrojs/node) local-only admin, Vue islands (@astrojs/vue)
├─ packages/
│  ├─ core/       # zod schemas, shared types, site.config.ts, slug/url/srcset builders, i18n UI strings
│  ├─ db/         # Supabase client factories, generated DB types, typed queries, fixtures loader
│  ├─ media/      # decode → metadata read → variants → watermark → metadata write → storage; CLI
│  └─ markdown/   # unified/remark/rehype pipeline shared by web build and admin preview
├─ supabase/      # config.toml, migrations/, seed.sql (Supabase CLI)
├─ docs/          # architecture, setup, content-model, media-pipeline, seo, accessibility, operations, adr/
├─ .github/       # workflows/, dependabot.yml
├─ CLAUDE.md  README.md  LICENSE  SECURITY.md
├─ turbo.json  pnpm-workspace.yaml  tsconfig.base.json  .gitignore  .env.example files per app
```

### Stack (use latest stable versions at implementation time; verify APIs in official docs before coding)
Astro (static + SSR with Node adapter, Content Layer custom loader, Actions, i18n routing) · Vue 3 (islands) · TypeScript `strict` + `noUncheckedIndexedAccess` · Zod · `@supabase/supabase-js` + Supabase CLI (migrations, local stack, type gen) · Sharp · `exiftool-vendored` (needs Perl, present on WSL/Ubuntu runners) · `heic-decode` fallback (Sharp prebuilt binaries cannot decode HEVC HEIC) · `file-type` (magic-byte validation) · `@aws-sdk/client-s3` (R2) · unified/remark/rehype + `rehype-sanitize` + Shiki · plain textarea + toolbar for Markdown (CodeMirror dropped in Phase 4, CSP) · `@astrojs/sitemap` · `@astrojs/rss` · Pagefind · Vitest · Playwright + `@axe-core/playwright` · ESLint (flat config, `eslint-plugin-astro`, `eslint-plugin-vue`) + Prettier (`prettier-plugin-astro`) · lefthook + gitleaks · Tailwind CSS v4 (phase 9 only). **pnpm only — never npm.**

---

## Data model (Supabase, `supabase/migrations`)

```
posts
  id uuid pk, lang text check (lang in ('en','es')), slug text, title text,
  description text (meta description, ≤160 chars), body_md text,
  status text check (draft|published|archived) default 'draft',
  published_at timestamptz null, cover_image_id uuid null → images(id) on delete set null,
  translation_key uuid null        -- posts sharing it are translations (hreflang)
  previous_slugs text[] default '{}' -- for redirect pages after slug changes
  created_at, updated_at (trigger)
  unique (lang, slug)

tags        id uuid pk, slug text unique, labels jsonb  -- {"en": "...", "es": "..."}
post_tags   post_id, tag_id, pk (post_id, tag_id)

images
  id uuid pk, seo_name text unique ([a-z0-9-]), status text (processing|ready|failed),
  original_key text, original_filename text, original_mime text, original_bytes int,
  width int, height int, dominant_color text,
  variants jsonb      -- [{ "w": 800, "h": 533, "bytes": 51234, "key": "images/2026/foo-1a2b3c4d-800.webp" }]
  metadata jsonb      -- the edited field set written into the files (see mapping table)
  alt jsonb, caption jsonb  -- per language {"en": "...", "es": "..."}
  watermark boolean, retired_keys text[] default '{}', created_at, updated_at

post_images  post_id, image_id, role text check (gallery|inline), position int,
             pk (post_id, image_id, role)   -- inline rows are synced by parsing body_md

revisions    id uuid pk, entity_type text check (post|image), entity_id uuid,
             snapshot jsonb, created_at  -- app keeps the last 50 per entity
```

**Security in the DB**
- RLS enabled on every table. Admin uses the **secret key** (local `.env` only), which bypasses RLS.
- The `anon`/publishable role (used by the CI build) can `select` only:
  - `posts` where `status = 'published' and published_at <= now()`.
  - `tags`.
  - `post_tags` and `post_images` rows of visible posts.
  - `images` referenced by visible posts, restricted with **column grants** so `original_key`, `original_filename` and `retired_keys` are never readable.
- No insert/update/delete for `anon`. `revisions` are not readable at all.
- Supabase Auth: **disable sign-ups** in the project settings; no auth is used.

---

## Media pipeline (`packages/media`)

1. **Intake:** validate magic bytes (`file-type`), max 100 MB, Sharp `limitInputPixels`.
   - Accept JPEG, PNG, WebP, AVIF, TIFF, GIF (first frame), HEIC/HEIF.
   - If Sharp can't decode HEIC, decode with `heic-decode` first.
2. **Read metadata** with `exiftool-vendored` (EXIF + IPTC + XMP) → normalized `ImageMetadata` object used to **prefill the form**.
3. **Variants:**
   - Auto-orient, convert to sRGB.
   - Widths `[400, 800, 1200, 1600, 2000]`, **never upscale**; if the original is narrower, include its own width as the largest.
   - WebP quality ~80, effort 5. Compute `dominant_color`.
4. **Watermark** (per-image toggle, default from `site.config.ts`):
   - Text or SVG logo, 9-point position, opacity, size relative to image width with a minimum pixel size.
   - Applied to public variants only; the original stays clean.
5. **Write metadata** into every variant with exiftool, after Sharp, which strips metadata by default.
   - Orientation is reset to 1.
   - GPS, device and capture time are **kept by default** (decided 2026-10-12: travel photos, possible future photo map); each can be removed, or all three with one switch.

   | Form field | Tags written (WebP supports EXIF + XMP) |
   |---|---|
   | Title | XMP-dc:Title, EXIF XPTitle |
   | Description | XMP-dc:Description, EXIF ImageDescription |
   | Creator | XMP-dc:Creator, EXIF Artist |
   | Copyright notice | XMP-dc:Rights, EXIF Copyright |
   | Credit line | XMP-photoshop:Credit |
   | License URL | XMP-xmpRights:WebStatement, XMP-plus:LicensorURL |
   | Keywords | XMP-dc:Subject, EXIF XPKeywords |
   | Date taken | EXIF DateTimeOriginal, XMP-photoshop:DateCreated |
   | Alt text (post language) | XMP-iptc4xmpCore:AltTextAccessibility |
   | Camera/lens/exposure | kept if "Keep camera info" is on (default on) |
   | GPS | kept unless "Keep location" is unticked or the single "remove technical data" switch is on |

6. **Storage adapter interface** with two implementations:
   - `r2`: public bucket `media`; keys `images/{yyyy}/{seo_name}-{hash8}-{w}.webp` (hash of the final bytes, so immutable caching is always safe — decided in Phase 2); `Cache-Control: public, max-age=31536000, immutable`; `Content-Type: image/webp`. The original goes to private bucket `originals` as `originals/{id}.{ext}`.
   - `local-fs`: for dev/tests; `<root>/public` (served by the admin at `/files/*`) and `<root>/private`.
7. **Operations:**
   - `processImage`, `reprocessImage` (from the original, e.g. watermark change), `updateMetadata` (rewrites tags and re-uploads), `renameImage`, `deleteImage` (refused while referenced).
   - `renameImage` creates new keys and moves the old ones to `retired_keys`. They are only deleted through a manual "Clean up retired files" action, so Google Images and cached pages don't 404.
8. **CLI:** `pnpm media process <file> [--out dir] [--no-watermark]` runs the same pipeline to a local folder for testing.

---

## Phases

Rules for the implementing agent:
- Do **one phase at a time**. At the end of each phase run its verification, update the related `docs/`, and stop for Aldo's review.
- **Never commit or push unless asked.** Commit messages are in English.
- Everything in English. Never use npm.

### Phase 0 — Foundation
- `mkdir blog-soy1limon`, `git init`. Copy this plan to `docs/roadmap.md` (source of truth for future sessions/models). pnpm workspace, Turborepo (`build`, `dev`, `lint`, `typecheck`, `test`), `tsconfig.base.json` (strict).
- ESLint + Prettier, Vitest workspace, lefthook pre-commit (lint-staged + **gitleaks**).
- `.gitignore`: `.env*` except `*.example`, `backups/`, `.media-local/`, `dist`, `.astro`.
- `CLAUDE.md`: project conventions overriding Aldo's global defaults — English comments and commits, pnpm only, commands, phase rules.
- `README.md` skeleton with an architecture mermaid diagram, `LICENSE` (MIT for code; state that blog content and images are **not** covered), `SECURITY.md`.
- `packages/core`: env schemas with zod (fail fast with clear messages), `site.config.ts` (site name per locale, author, default image metadata, watermark config, media base URL, widths).
- `.github/workflows/ci.yml`: install with frozen lockfile → lint → typecheck → test. Uses `pull_request` (never `pull_request_target`), no secrets, actions pinned by SHA. Add `dependabot.yml`.
- **Verify:** `pnpm lint && pnpm typecheck && pnpm test` pass; a fake secret in a staged file is blocked by gitleaks.

### Phase 1 — Data layer
- Supabase CLI: `supabase init`, local stack via Docker, migrations for the schema above, `updated_at` trigger, RLS policies, column grants, `seed.sql` with sample bilingual posts.
- Generate types into `packages/db`.
- `packages/db`:
  - `createAdminClient()` (secret key, refuses to run if `CI=true`) and `createPublicClient()` (publishable key).
  - Typed queries: posts CRUD, tags, images, post_images sync, revisions with retention 50.
  - **Fixtures source** (`CONTENT_SOURCE=fixtures`, JSON in `packages/db/fixtures/`) that returns the same shapes as the published queries.
- `pnpm db:backup`: `supabase db dump` (schema + data) into gitignored `backups/` with a timestamp.
- Docs: `docs/content-model.md`.
- **Verify:** RLS integration tests against the local stack with the anon key:
  - Drafts, future-dated posts and revisions are not visible.
  - `images.original_key` is not readable.
  - Inserts and updates are denied.

### Phase 2 — Media pipeline
- Implement `packages/media` exactly as specified above, plus the CLI.
- Fixtures:
  - JPEG with GPS and orientation 6.
  - PNG with alpha.
  - HEIC from an iPhone.
  - A wide panorama and a tiny image (300px).
  - A file with a lying extension.
- Docs: `docs/media-pipeline.md` including the mapping table.
- **Verify (Vitest):**
  - Outputs are WebP at the expected widths with no upscaling, and the orientation is correct.
  - GPS is present with the correct sign when kept and absent when removed, and every mapped field is present.
  - Metadata overhead is < 2.5 KB (full profile, variants ≥ 1200 px) and < 1.5 KB (compact profile, smaller variants), using exiftool `-api Compact=All`.
  - The watermark is detectable (pixel diff vs. `--no-watermark`).
  - The lying extension is rejected (the bytes decide the type: a renamed PNG is accepted as PNG, text named `.jpg` is rejected).
  - The `local-fs` adapter round-trips.

### Phase 3 — Admin: shell + media
- `apps/admin`: Astro `output: 'server'`, Node adapter, Vue islands. `pnpm admin` runs on `127.0.0.1:4322` only.
- **Localhost hardening:**
  - Binds to `127.0.0.1`; the middleware also rejects non-loopback client addresses.
  - Middleware rejects requests whose `Host` isn't localhost/127.0.0.1 (DNS-rebinding protection).
  - Astro `security.checkOrigin` on, so other sites in the browser can't make cross-site POSTs to the admin.
- Mutations via **Astro Actions** with zod input (file uploads via form actions).
- Accessible layout: landmarks, skip link, a visible focus outline, live region for status/toasts, error summaries linked to fields.
- **Upload flow:**
  1. Multi-file drop zone plus a file input (keyboard accessible).
  2. Per-image **stepper** ("Image 2 of 5", Previous/Next), with each form **prefilled from the file's metadata**.
  3. Each field can be edited or removed (checkbox "Remove this field").
  4. SEO file name is auto-suggested from the title (slugified), editable, with live uniqueness check.
  5. Alt text is required, tied to the post language, with guidance and a character counter.
  6. Watermark toggle; "Keep location / device / capture time" toggles plus one switch that removes all three; warning if the author's name appears in the file's metadata.
  7. **"Apply creator/copyright/license/keywords to remaining images"** to avoid retyping.
  8. Process with per-image progress and a summary.
- Media library: grid/list, filters (unused, by year), search by name/alt.
- Image detail: preview and variants, edit metadata (writes a revision, then rewrites files), reprocess, rename, delete when unreferenced, clean up retired files, revision history with restore.
- Dashboard: drafts, published, scheduled; storage used (sum of bytes) vs. the 10 GB R2 free tier.
- **Verify:** Playwright e2e on `local-fs` + the local Supabase stack: upload 3 images → stepper → apply-to-remaining → process → library shows them; `exiftool` on a produced file shows the edited values; axe finds 0 violations on every admin page.

### Phase 4 — Admin: posts
- `packages/markdown`:
  - remark-gfm, heading anchors, and **h1 demotion** (the post title is the only h1).
  - Shiki highlighting and `rehype-sanitize` (allow-list).
  - A plugin that turns `![alt](image:<uuid>)` into a responsive `<img>`/`<figure>` with `srcset`, `sizes`, `width`/`height`, `loading`/`decoding` and alt in the post language. Missing alt is a build error.
- Post editor:
  - Title, slug (auto, editable, unique per language; changing a published slug appends to `previous_slugs`).
  - Language (`en`/`es`), translation link (pick the counterpart post → shared `translation_key`).
  - Meta description with a counter and a Google result preview.
  - Tags with create-inline.
  - Optional cover image, optional gallery (picker plus **keyboard reorder with Move up/Move down buttons**, not drag-only).
  - Markdown editor: a plain `<textarea>` with a formatting toolbar and an "Insert image" dialog (decided in Phase 4 instead of CodeMirror 6, whose injected `<style>` elements conflict with the hash-based CSP; the textarea is also more accessible).
  - **Live preview** rendered server-side with the same pipeline as the public site.
- Autosave drafts only (debounced, plus a localStorage safety copy); published/scheduled posts change only on an explicit "Update"; a revision on every manual save, ordered by an identity column; history with diff and restore.
- Status actions: Save draft / Publish now / Schedule (future `published_at`) / Unpublish / Archive.
- Validation before publish: title, description, slug, alt for every referenced image in the post language, valid image references.
- Rule for hearing accessibility: no audio/video in v1. Any future embed must ship WebVTT captions and a transcript, enforced by the markdown plugin.
- **Verify:** unit tests for the markdown plugins; e2e: create a bilingual pair, publish, edit the slug, restore a revision; axe 0 violations.

### Phase 5 — Public site (functional)
- `apps/web`: Astro static.
  - A cached build-time content module (`src/lib/content.ts`, decided in Phase 5 instead of a Content Layer loader) reading published content via `packages/db` (Supabase or fixtures) and rendering it with the shared markdown pipeline; the build fails on content problems.
  - i18n routing with `en` as the default without prefix and `es` under `/es/`.
  - UI strings come from `packages/core/i18n`.
- Routes per locale:
  - Home (latest posts).
  - Paginated archive `/blog/page/N/`.
  - Post `/blog/{slug}/` and `/es/blog/{slug}/`.
  - Tag pages, a 404, and RSS per locale.
  - Redirect pages for `previous_slugs` (meta refresh plus canonical, since Pages has no server redirects).
- Posts render correctly with no image, a cover only, a gallery, and inline images.
  - Gallery is a `<ul>` of `<figure>`s linking to the 2000w variant.
  - `<html lang>` set per post, plus `lang` on mixed-language snippets.
- Pagefind static search, built post-build and indexed per language.
- Zero client JS by default.
- **Verify:** `CONTENT_SOURCE=fixtures pnpm --filter web build` succeeds offline; Playwright plus axe over every built route shows 0 violations; a link check of the built site finds no broken links.

### Phase 6 — SEO
- `<SeoHead>`:
  - Title template, meta description, canonical, `hreflang` alternates plus `x-default` when a translation exists.
  - Open Graph (`og:type=article`, image = 1200w variant with width/height/alt, or the default site OG image when a post has no images), Twitter card, `article:published_time` and `modified_time`.
  - Robots meta.
- JSON-LD:
  - `BlogPosting` (headline, description, image[], datePublished, dateModified, author `Person`, inLanguage, mainEntityOfPage).
  - `ImageObject` with `license`, `acquireLicensePage`, `creator`, `creditText` and `copyrightNotice` (Google Images "Licensable").
  - `BreadcrumbList`, plus `WebSite` and `Person` on the home page.
- Sitemap with i18n alternates, `lastmod` and **image entries** (generated from content by our own endpoint, decided in Phase 6 instead of `@astrojs/sitemap`, because translated posts have different slugs); `robots.txt` pointing to the sitemap.
- `DEPLOY_ENV` (development by default): only production builds are indexable and load analytics. Analytics added in Phase 6 at the owner's request: Cloudflare Web Analytics (free, cookieless), with a `?analytics=off` per-browser opt-out for the author's own visits.
- Search Console verification via a DNS TXT record (documented).
- Docs: `docs/seo.md`.
- **Verify:** unit tests on the JSON-LD builders (typed with `schema-dts`); a post-build script asserts on every page:
  - Exactly one h1, plus canonical, description and lang.
  - `hreflang` reciprocity.
  - All images have alt, width and height.
  - Every sitemap URL exists.

  Then check one post manually with Google's Rich Results Test after deploy.

### Phase 7 — Deploy & operations
- Cloudflare:
  - R2 buckets `media` (public via custom domain `img.<domain>`) and `originals` (private).
  - A scoped R2 API token (Object Read & Write on those 2 buckets only).
  - A cache rule for `img.<domain>`. _(Not needed: `.webp` is cached by Cloudflare's default rules and every object is uploaded with an immutable `Cache-Control`.)_
  - DNS for GitHub Pages: apex A/AAAA records + `www` CNAME, DNS-only so Pages can issue its certificate.
- `.github/workflows/deploy.yml`:
  - Triggers: push to `main`, `repository_dispatch` (`content-changed`), daily `schedule`, and `workflow_dispatch`.
  - `concurrency` with cancel-in-progress. _(Changed: one `pages` group without cancelling, so a deploy is never cut halfway; GitHub keeps only the newest pending run. See ADR 0005.)_
  - Builds with the `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` secrets (the only CI secrets), then `actions/upload-pages-artifact` → `actions/deploy-pages`.
  - Minimal permissions: `pages: write`, `id-token: write`, `contents: read`.
  - If Supabase is down or paused, the build fails and Pages keeps serving the last good deploy.
- Admin:
  - "Publish" and "Rebuild site" fire `repository_dispatch` with a fine-grained PAT (this repo only), stored in the admin's local `.env`. _(Implemented more broadly: any change visible on the live site — publish, unpublish, archive, delete, editing a live post or an image it uses — triggers it. Cleaning up retired image files is refused until a deploy that started after the edit succeeded.)_
  - The admin shows the latest deploy run status.
  - On startup it checks whether the scheduled workflow was disabled (GitHub disables crons after 60 days without repo activity) and re-enables it via the API. _(Done on the first dashboard load of each admin process.)_
- Repo settings: enable secret scanning + push protection, branch protection on `main`, Pages source = GitHub Actions, custom domain + enforce HTTPS.
- Docs:
  - `docs/setup.md`: step by step from zero (Supabase project, disable sign-ups, run migrations, R2, domain, tokens, GitHub settings).
  - `docs/operations.md`: backups/restore, key rotation, Supabase paused, storage limits.
  - `docs/adr/` with the key decisions.
- **Verify:** publish a real post from the admin → workflow runs → the post is live on `<domain>` with images from `img.<domain>`; the downloaded image shows the correct metadata (GPS only when kept); Cloudflare reports cache hits on images.

### Phase 8 — Quality pass
- Manual checks:
  - Keyboard-only walkthrough of the admin and the site.
  - Screen reader pass (NVDA on Windows) on a post page, the gallery and the upload stepper.
  - 200% zoom / 320px reflow.
  - `prefers-reduced-motion`.
- CI checks:
  - Lighthouse CI on the fixtures build with budgets (a11y 100, SEO 100, performance ≥ 95).
  - A link checker on the built site.
- Fix everything found; update `docs/accessibility.md` with the checklist and the known limitations.
- _(Implemented: the reflow, zoom, reduced-motion and keyboard checks are automated in `e2e/quality.spec.ts` of both apps, plus dark-mode axe and text spacing. Lighthouse runs inside the Playwright suite with the `lighthouse` package instead of Lighthouse CI (no extra server or upload). The link checker covers internal links, fragments and files; external links are only required to be HTTPS. The NVDA pass stays manual: see the checklist in `docs/accessibility.md`.)_

### Phase 9 — Styling (last)
- _(Changed before starting: styles are interchangeable themes in `packages/themes` over the unchanged semantic markup, see [ADR 0006](adr/0006-themes-over-semantic-html.md) and [themes](themes.md). The first theme is **iStyle**; its tokens already exist. Tailwind is optional inside a theme, never as classes in the markup.)_
- Tailwind CSS v4 in `apps/web` and `apps/admin`, with shared design tokens in `packages/core` (CSS variables).
- iOS-inspired look (the **iStyle** theme):
  - System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", …`), so no font downloads.
  - Light and dark via `prefers-color-scheme`, translucent headers, generous spacing, rounded cards.
  - "Grouped list" forms in the admin (iOS Settings style), segmented controls, sheets/modals built on `<dialog>`.
  - An accessible lightbox for galleries (focus trap, Esc, arrow keys).
- Constraints: contrast ≥ 4.5:1 (text) and 3:1 (UI) verified in both themes; visible focus is kept; motion respects reduced-motion.
- **Verify:** re-run the axe, Lighthouse and visual checks from Phase 8 in both themes; no regressions.

---

## Environment variables (names only; values never committed)

- `apps/admin/.env`:
  - `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_MEDIA_BUCKET`, `R2_ORIGINALS_BUCKET`.
  - `MEDIA_BASE_URL`, `STORAGE_DRIVER` (`r2` | `local-fs`).
  - `GITHUB_REPO`, `GITHUB_TOKEN`.
- `apps/web/.env`: `CONTENT_SOURCE` (`supabase` | `fixtures`), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`.
- GitHub Actions secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. Nothing else.

## End-to-end verification (after Phase 7)
1. `pnpm install && pnpm lint && pnpm typecheck && pnpm test` are green.
2. `supabase start` → `pnpm admin` → upload a HEIC + a JPEG with GPS → fill the stepper → create a Spanish post with a gallery and an English translation → schedule one, publish the other.
3. The Actions deploy succeeds. On `<domain>`:
   - Both language versions exist and are linked by `hreflang`.
   - The scheduled post is absent until its date (the cron build publishes it).
   - Images are WebP from `img.<domain>`, with srcset and alt in the right language.
4. Download an image → `exiftool` shows the creator/copyright/license/alt, and GPS only for images where it was kept.
5. The Rich Results Test validates `BlogPosting` + `ImageObject`; the sitemap contains the posts and images.
6. axe shows 0 violations and Lighthouse a11y/SEO are 100 on the deployed site.
7. Repo audit: `gitleaks detect` over the full history is clean; anon-key queries cannot read drafts or originals.
