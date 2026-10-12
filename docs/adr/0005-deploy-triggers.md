# 0005 — Deploys triggered by the admin plus a daily build

- Status: accepted
- Date: 2026-10-12

## Context

A static site only changes when it is rebuilt ([0001](0001-static-site-on-github-pages.md)), but
content changes happen in Supabase, not in git. Scheduled posts must appear without anyone pressing
a button, and the free Supabase project pauses when idle.

## Decision

`deploy.yml` runs on:

- `repository_dispatch` (`content-changed`), sent by the admin with a fine-grained token after any
  change that alters the public site (publishing, unpublishing, editing a live post or an image it
  uses) and from the **Rebuild site** button;
- a daily `schedule`, which publishes scheduled posts and keeps Supabase active;
- `push` to `main` and `workflow_dispatch`.

Concurrency uses one group with `cancel-in-progress: false`: a running deploy is never interrupted
and GitHub keeps only the newest pending run. The admin shows the latest runs and re-enables the
schedule when GitHub disables it after 60 days without commits.

## Alternatives considered

- **Hourly schedule**: scheduled posts would be more punctual, but it adds 24 deployments a day for a
  blog that changes a few times a month. The author can press **Rebuild site** for exact timing.
- **Supabase database webhooks calling GitHub**: needs the GitHub token stored in Supabase and fires
  on every autosave of a draft.
- **`cancel-in-progress: true`** (the original plan): could stop a deploy halfway; queueing gives the
  same "latest content wins" result safely.

## Consequences

- Scheduled posts appear with the first build after their time (normally the next daily build).
- The client payload sent to GitHub contains only a generic reason (`publish`, `manual`, …), since
  workflow runs of a public repository are public.
