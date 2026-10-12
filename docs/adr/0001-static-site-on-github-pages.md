# 0001 — Static site on GitHub Pages

- Status: accepted
- Date: 2026-10-12

## Context

The blog must cost nothing beyond the domain, load fast, rank well and have no server to maintain
or attack. The repository is public.

## Decision

Build the public site with Astro in `output: 'static'` mode and deploy it to GitHub Pages through
GitHub Actions (`.github/workflows/deploy.yml`). Search is static too (Pagefind). The site ships no
JavaScript except the search page and, in production, the analytics beacon.

## Consequences

- Free hosting and HTTPS, served from GitHub's CDN; nothing to patch.
- No server-side logic: redirects for changed slugs are static pages with `<meta http-equiv="refresh">`
  plus a canonical link, visit counting uses Cloudflare Web Analytics, and every content change needs
  a rebuild ([0005](0005-deploy-triggers.md)).
- GitHub Pages cannot set custom headers, so the site cannot send a Content Security Policy header.
  It has no third-party scripts besides the analytics beacon, which limits the impact.
