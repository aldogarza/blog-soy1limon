# 0002 — Content in Supabase, read through RLS

- Status: accepted
- Date: 2026-10-12

## Context

Posts written as Markdown files in the repository would make every draft public, because the
repository is public. The content also needs relations (tags, translations, images used by posts)
and a history of versions.

## Decision

Store posts, tags, images and revisions in Supabase Postgres (free plan). Row Level Security plus
column grants let the publishable key read **only** published, already-dated posts and the
non-sensitive columns of the images they use. Only the local admin holds the secret key. Schema
changes are SQL migrations in `supabase/migrations`, tested against a local stack in CI.

## Consequences

- Drafts and scheduled posts never reach the repository, the build logs or the public site.
- The build depends on Supabase being up. If it is down or paused, the deploy fails and Pages keeps
  serving the previous version.
- Free projects pause after a week idle; the daily build keeps the project active.
- Backups are manual (`pnpm db:backup`), because automatic backups are a paid feature.
- Offline builds and pull-request CI use JSON fixtures with the same shape, so they need no secrets.
