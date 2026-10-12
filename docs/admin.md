# Admin

`apps/admin` is where photos are uploaded and described (and, from phase 4, where posts are written).
It is an Astro server app with Vue islands that **only runs on the author's machine** and is never
deployed.

## Running it

```sh
pnpm db:start     # only when working against the local database
pnpm admin        # build + start on http://127.0.0.1:4322 (fast, production mode)
pnpm admin:dev    # dev server with hot reload, same address
```

Configuration comes from `apps/admin/.env` (see `.env.example`):

- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` choose the database: local stack or the real project.
- `STORAGE_DRIVER=local-fs` keeps images in `.media-local/` and serves them at `/files/*`.
- `STORAGE_DRIVER=r2` uses Cloudflare R2 (the real setup; see [setup](setup.md#55-admin-env-for-the-real-services)).
- `GITHUB_REPO` and `GITHUB_TOKEN` let the admin start deploys and show their status. Without them
  the site still rebuilds daily and on every push.

## Security model

The admin holds the secret database key, so it defends itself even though it only runs locally.

| Threat                                                       | Defence                                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Someone on the same network                                  | Binds to `127.0.0.1` only, and the middleware rejects non-loopback client addresses      |
| DNS rebinding (a website whose domain resolves to 127.0.0.1) | The middleware rejects any `Host` header that is not `127.0.0.1`, `localhost` or `[::1]` |
| Another open tab posting forms to the admin (CSRF)           | Astro `security.checkOrigin` rejects cross-site form posts                               |
| Injected scripts                                             | Hash-based Content Security Policy (`security.csp`) sent as a header                     |
| Framing / clickjacking                                       | `X-Frame-Options: DENY`                                                                  |
| Path traversal in `/files/*` and staging                     | Keys and staging tokens are validated before touching the disk                           |
| Accidental indexing                                          | `X-Robots-Tag: noindex` and a robots meta tag                                            |

## Uploading images

1. **Choose photos**: the file input works with the keyboard; drag and drop is an extra. Each file
   is validated by its bytes, stored in a private staging folder, and inspected.
   - Files up to 200 MB are accepted (`siteConfig.media.maxUploadBytes`). Astro's own request limit (`security.actionBodySizeLimit`, 1 MB by default) is raised to 210 MB to match.
2. **Describe them one by one**: one form per image, prefilled with what the file already says plus
   the site defaults.
   - **File name (SEO)**: suggested from the title or file name, checked live for availability.
   - **Alt text** in English and/or Spanish (at least one is required), with a length guide. Optional captions.
   - **Description and credits**: embedded in the files. Leave a field empty to remove it.
   - **Location, device and capture time**: shown read-only from the original. All three are kept by
     default (travel photos, a possible photo map). Each can be unticked, or **one switch removes all
     three at once**.
   - **Watermark** on or off.
   - **Your name in the metadata**: if a configured private term (`siteConfig.privacy.sensitiveTerms`)
     appears anywhere in the file's metadata, a warning lists where.
   - **"Use these credits and keywords for the remaining images"** copies creator, copyright, credit,
     license and keywords forward so they are typed once.
3. **Process**: each image is rendered, uploaded and saved; progress is announced to screen readers.
   Failures stay in the list to fix and retry.

## Editing an image

The detail page (`/media/<id>`) shows the public files, where the image is used, the embedded
metadata and its history.

- **Saving** renders new files from the stored original. Removed technical data can be brought back
  because it is re-read from the original.
- **Old files** are kept as "retired" until you clean them up, so pages that are already cached keep
  working.
- **History**: every save records a revision, and any older version can be restored.
- **Deleting** is refused while a post uses the image and needs an explicit confirmation.

## Writing posts

`/posts` lists every post with its status (draft, scheduled, published, archived), language and
public address. **New post** asks for the language and a title and creates a draft.

The editor (`/posts/<id>`):

- **Title and address**:
  - While the post is a new draft, the address (slug) follows the title until you edit it.
  - Its availability is checked live: unique per language, including old addresses of other posts.
  - Renaming a **published** post keeps the old address as a redirect.
- **Description and search preview**: a length guide and a mock Google result.
- **Body**: a plain `<textarea>` with a formatting group.
  - The group has Bold, Italic, Heading, Link, Lists, Quote, Code and **Insert image**. Shortcuts:
    Ctrl+B, Ctrl+I and Ctrl+K.
  - Images are referenced as `![optional alt](image:<id>)`. Without written alt text, the image's alt
    in the post language is used.
  - Raw HTML is never rendered.
  - A plain textarea was chosen over CodeMirror. CodeMirror injects `<style>` elements, which the
    hash-based CSP blocks, and a native textarea works best with screen readers and never traps Tab.
- **Cover and gallery**:
  - Chosen in an accessible `<dialog>` picker that shows each image's alt text in the post language.
  - The gallery order changes with **Move up / Move down** buttons (no drag and drop needed), and
    each move is announced.
- **Tags**: tick existing ones or create a tag (English/Spanish names) in place.
- **Translation**: pick the counterpart post in the other language. Both share a translation key,
  which becomes `hreflang` on the public site.
- **Preview**:
  - Rendered on the server with the same pipeline as the public site (`packages/markdown`).
  - Lists what is **needed before publishing**: title, description, body, existing images, and alt
    text in the post language for every image.
  - Also lists what is **worth checking**, such as long titles or descriptions and removed HTML.
- **Publishing**:
  - Publish now, schedule (local date and time), update, unpublish or archive.
  - Publishing always validates on the server first.
  - Any change visible on the live site starts a rebuild, and the editor says so (see below).
- **Saving**:
  - **Drafts save automatically** (3 s after you stop typing).
  - Published and scheduled posts only change when you press **Update**, so a half-finished edit can
    never go live with the next build.
  - Every change is also kept in the browser, and unsaved work is offered back after a crash or a
    closed tab.
- **History**: each manual save or publish records a revision.
  - You can compare any revision with the editor (accessible diff) or restore it.
  - Revisions are ordered by insertion (`revisions.seq`), so two saves in the same instant never
    swap places.

## Deploying the public site

The dashboard's **Public site** section shows the last five runs of the deploy workflow (when,
why and the result, linked to the logs) and a **Rebuild site** button. The admin starts a rebuild on
its own after publishing, unpublishing, archiving or deleting a post that was online, after updating
a published post and after editing an image that a published post shows. Scheduled posts wait for
the daily build. Details and troubleshooting: [operations](operations.md).

Two safety rules:

- **Retired image files** (old names left after editing an image) can only be deleted once a deploy
  that started after the edit has succeeded, so the live site never points at missing files.
- The end-to-end tests blank `GITHUB_REPO` and `GITHUB_TOKEN`, so they can never start a real deploy.

## Accessibility

The admin follows the same WCAG 2.2 AA rules as the public site.

- Semantic landmarks and a skip link.
- Visible focus, and labels plus hints tied to every input.
- Errors are flagged with `aria-invalid` and collected in a summary that receives focus and links to each field.
- Focus moves to the heading of each step, and status messages use live regions.
- Destructive actions use plain HTML forms that work without JavaScript.

The end-to-end tests run axe on every page.

## Tests

| Command         | What it covers                                                                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`     | Host checks, staging, form schema (including the single "remove technical data" switch), storage stats                                                                                                                                                                                                |
| `pnpm test:e2e` | In Chromium with axe on each page: (1) media: upload → describe → process → edit → clean up → delete, with exiftool checks on the produced files; (2) posts: write → validation blocks a missing alt → cover/gallery/inline/tag → publish → Spanish translation → rename → compare/restore → autosave |

The end-to-end suite builds the admin and runs it on port 4323 against the **local** Supabase
stack and a temporary media folder. It refuses to start if the database is not local. Chromium
needs system libraries once per machine:
`pnpm --filter @soy1limon/admin exec playwright install-deps chromium`.
