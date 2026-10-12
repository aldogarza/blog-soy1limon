# 0003 — Admin runs only on the author's machine

- Status: accepted
- Date: 2026-10-12

## Context

Publishing needs a writing interface and image processing (Sharp, exiftool) with large uploads.
A hosted admin would need authentication, a server and a paid plan for big request bodies, and
would be reachable by anyone on the internet.

## Decision

`apps/admin` is an Astro server app (Node adapter, Vue islands) started with `pnpm admin`. It binds
to `127.0.0.1`, rejects non-loopback clients and `Host` headers (DNS rebinding), checks the origin
of every form post (CSRF) and sends a strict Content Security Policy. It has no login because only
the author's own machine can reach it.

## Consequences

- No account system, no attack surface on the internet, no hosting cost.
- Publishing requires the author's computer with the repository and its `.env`. Writing from a phone
  is not possible.
- The admin's `.env` holds every privileged credential (Supabase secret key, R2 keys, GitHub token);
  protecting that machine is protecting the blog.
