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
- `STORAGE_DRIVER=r2` uses Cloudflare R2 (phase 7).

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

## Accessibility

The admin follows the same WCAG 2.2 AA rules as the public site.

- Semantic landmarks and a skip link.
- Visible focus, and labels plus hints tied to every input.
- Errors are flagged with `aria-invalid` and collected in a summary that receives focus and links to each field.
- Focus moves to the heading of each step, and status messages use live regions.
- Destructive actions use plain HTML forms that work without JavaScript.

The end-to-end tests run axe on every page.

## Tests

| Command         | What it covers                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`     | Host checks, staging, form schema (including the single "remove technical data" switch), storage stats                                        |
| `pnpm test:e2e` | The full upload → describe → process → edit → clean up → delete flow in Chromium, axe on each page, and exiftool checks on the produced files |

The end-to-end suite builds the admin and runs it on port 4323 against the **local** Supabase
stack and a temporary media folder. It refuses to start if the database is not local. Chromium
needs system libraries once per machine:
`pnpm --filter @soy1limon/admin exec playwright install-deps chromium`.
