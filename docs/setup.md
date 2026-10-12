# Setup

This guide grows with the roadmap. Sections marked _(phase N)_ are filled in when that phase lands.

## 1. Local prerequisites

| Tool     | Version                                                 | Why                                                                |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Node.js  | 24 (see `.node-version`)                                | Runtime for every app and script                                   |
| pnpm     | 11                                                      | Package manager. **Never use npm** in this repo                    |
| git      | any recent                                              | Version control                                                    |
| gitleaks | 8.x                                                     | Required by the pre-commit hook; blocks commits containing secrets |
| Docker   | recent (Docker Desktop with WSL integration on Windows) | Local Supabase stack _(phase 1)_                                   |
| Perl     | 5.x (preinstalled on Linux/WSL)                         | Used by exiftool for image metadata _(phase 2)_                    |

### Installing gitleaks (Linux / WSL, no sudo)

Download the official release, verify its checksum, and install it to `~/.local/bin`:

```sh
V=8.30.1
cd "$(mktemp -d)"
curl -fsSLO "https://github.com/gitleaks/gitleaks/releases/download/v$V/gitleaks_${V}_linux_x64.tar.gz"
curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v$V/gitleaks_${V}_checksums.txt" \
  | grep " gitleaks_${V}_linux_x64.tar.gz$" | sha256sum --check
tar -xzf "gitleaks_${V}_linux_x64.tar.gz" gitleaks
install -m 755 gitleaks ~/.local/bin/gitleaks
gitleaks version
```

Make sure `~/.local/bin` is on your `PATH`.

## 2. Install the project

```sh
pnpm install   # installs dependencies and the lefthook git hooks
pnpm lint && pnpm typecheck && pnpm test
```

### What the pre-commit hook does

- `gitleaks` scans the staged changes and **aborts the commit** if it finds a credential.
- ESLint (`--fix`) and Prettier run on staged files and re-stage the fixes.

### Dependency safety

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`, so pnpm ignores versions published less than
  24 hours ago. Most malicious package releases are caught and pulled within that window.
- Install scripts of dependencies are blocked unless listed with `true` under `allowBuilds`.

## 3. Environment files

Each app has a `.env.example` listing every variable it needs (added with the app). Copy it to `.env`
in the same folder and fill in the values. Real `.env` files are git-ignored and must never be
committed. Variables are validated at startup by the zod schemas in `packages/core/src/env.ts`;
a missing or wrong value stops the app with a readable message.

## 4. Supabase

The Supabase CLI is a dev dependency; run it with `pnpm exec supabase …`.
Project configuration lives in `supabase/config.toml` (sign-ups are disabled: the project uses no auth).

### Link the remote project

Both commands are interactive, so run them yourself:

```sh
pnpm exec supabase login                                   # opens the browser for an access token
pnpm exec supabase link --project-ref <project-ref>        # asks for the database password
pnpm exec supabase migration list                          # confirms the connection
```

The CLI stores the link under `supabase/.temp/` (git-ignored). The database password is not saved in the repo.

In the dashboard, also turn off **Authentication → Sign In / Providers → Allow new users to sign up**.

### Keys

| Key                              | Where it goes                          | Why                                                                       |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Publishable (`sb_publishable_…`) | `apps/web/.env`, GitHub Actions secret | Read-only access to published content through RLS                         |
| Secret (`sb_secret_…`)           | `apps/admin/.env` only                 | Full access for the local admin. Never in CI, never in chat, never in git |

Run `supabase login` and `supabase link` from a normal terminal. They need an interactive TTY, so
they fail inside tools that run commands without one.

### Local stack

Development and tests use a throwaway Supabase running in Docker. Services this project doesn't use
(storage, realtime, edge functions, analytics) are excluded to save memory.

| Command                     | What it does                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| `pnpm db:start`             | Starts the local stack (first run downloads the images)                   |
| `pnpm db:stop`              | Stops it                                                                  |
| `pnpm db:reset`             | Recreates the local database from the migrations + `supabase/seed.sql`    |
| `pnpm db:types`             | Regenerates `packages/db/src/database.types.ts` from the local schema     |
| `pnpm test:integration`     | RLS and query tests against the local stack                               |
| `pnpm exec supabase status` | Shows the local URLs and keys, including Studio at http://127.0.0.1:54323 |

The local keys are well-known development defaults, so they are safe to print. The seed only ever
runs locally.

### Real project: migrations and backups

```sh
pnpm db:backup   # schema + data dump into backups/ (git-ignored); asks for the DB password
pnpm db:push     # applies pending migrations to the linked project
```

Always back up before pushing. `SUPABASE_DB_PASSWORD` can be exported to avoid the prompt.

## 5. Cloud services: Supabase, Cloudflare R2, domain, GitHub _(phase 7)_
