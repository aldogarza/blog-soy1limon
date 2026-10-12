# 0004 — Images processed locally, served from R2

- Status: accepted
- Date: 2026-10-12

## Context

Photos are the heaviest part of the blog. GitHub Pages has a 1 GB size limit and a soft bandwidth
limit, and images in git would bloat the repository forever.

## Decision

- The admin converts every upload to WebP in several widths (no upscaling), with an optional
  watermark and the metadata chosen in the form written into each file.
- Variants go to a public R2 bucket behind `img.<domain>` (Cloudflare cache). Originals go to a
  private bucket and are the source for any re-processing.
- Keys are content-addressed: `images/{year}/{seo-name}-{hash8}-{width}.webp`. Any change to the
  pixels or metadata gives a new name, so files are served with
  `Cache-Control: public, max-age=31536000, immutable` and never need purging.
- Old names are "retired", not deleted, until the author cleans them up after the site was rebuilt.
- Location, device and capture time are kept by default (travel photos, a possible photo map) and
  can be removed per photo; the admin warns if the author's name appears in the metadata.

## Consequences

- R2 egress is free and Cloudflare caches at the edge, so traffic costs nothing.
- Storage is free up to 10 GB; the dashboard shows the usage.
- Editing an image rewrites its files and requires a rebuild for the pages to use the new names.
- Local processing needs Sharp and exiftool (Perl) on the author's machine.
