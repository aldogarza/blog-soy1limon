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

## 5. Cloud services

Everything below fits the free tiers. The only cost is the domain. Examples use `example.com`;
this blog uses `soy1limon.com`.

### 5.1 Supabase project

1. Create a project at <https://supabase.com/dashboard> (free plan, region close to you).
2. **Authentication → Sign In / Providers**: turn off **Allow new users to sign up**. Nothing uses
   auth; a closed door is safer.
3. Link the CLI and apply the migrations (see [section 4](#4-supabase)):
   ```sh
   pnpm exec supabase link --project-ref <project-ref>
   pnpm db:push
   ```
4. **Project Settings → API Keys**: copy the project URL, the publishable key and the secret key.
   The secret key goes only in `apps/admin/.env`.

Free projects pause after a week without activity. The daily deploy reads the database, which
counts as activity. If it ever pauses anyway, see [operations](operations.md#supabase-paused).

### 5.2 Domain on Cloudflare

The domain's DNS must be managed by Cloudflare (free plan) so R2 can use a subdomain. Add the site in
Cloudflare and point the registrar's nameservers to the ones Cloudflare shows.

DNS records for GitHub Pages (**DNS only**, grey cloud: GitHub must see the real requests to issue
the HTTPS certificate):

| Type  | Name  | Content                                                                                    |
| ----- | ----- | ------------------------------------------------------------------------------------------ |
| A     | `@`   | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`                 |
| AAAA  | `@`   | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | `www` | `<github-user>.github.io`                                                                  |

The `img` record is created by R2 in the next step and stays proxied (orange cloud): that is what
puts Cloudflare's cache in front of the images.

### 5.3 Cloudflare R2

1. **R2 → Overview**: enable R2. The free tier needs a payment method on file but charges nothing
   within 10 GB of storage and 1 million writes per month; downloads (egress) are always free.
2. Create two buckets with the default location:
   - `<name>-media`: public variants.
   - `<name>-originals`: original uploads. **Never** give it public access.
3. In the media bucket, **Settings → Custom Domains → Connect domain**: `img.example.com`. Do not
   enable the `r2.dev` development URL.
4. **R2 → Manage API tokens → Create User API token** (not an account-wide token):
   - Permission: **Object Read & Write**.
   - Specify buckets: only the two buckets above.
   - Copy the **Access Key ID** and **Secret Access Key** (shown once) and the **Account ID**
     (32 hex characters, on the R2 overview page).

Caching: every variant is uploaded with `Cache-Control: public, max-age=31536000, immutable` and a
content-addressed name, so Cloudflare's default cache rules already keep `.webp` files at the edge
and browsers never revalidate them. No extra cache rule is needed. Check it with
`curl -sI https://img.example.com/<key>` twice: the second answer shows `cf-cache-status: HIT`.

### 5.4 GitHub repository

1. Create the repository (public) and push `main`.
2. **Settings → Pages**: Source **GitHub Actions**; custom domain `example.com`; wait for the
   certificate and tick **Enforce HTTPS**.
3. Recommended: **your profile Settings → Pages → Add a verified domain**. GitHub gives a TXT record
   for Cloudflare. A verified domain cannot be taken over by another account's Pages site.
4. **Settings → Secrets and variables → Actions**:

   | Kind     | Name                             | Value                                         |
   | -------- | -------------------------------- | --------------------------------------------- |
   | Secret   | `SUPABASE_URL`                   | `https://<project-ref>.supabase.co`           |
   | Secret   | `SUPABASE_PUBLISHABLE_KEY`       | `sb_publishable_…` (**never** the secret key) |
   | Variable | `SITE_URL`                       | `https://example.com`                         |
   | Variable | `MEDIA_BASE_URL`                 | `https://img.example.com`                     |
   | Variable | `CLOUDFLARE_WEB_ANALYTICS_TOKEN` | Optional; see [SEO](seo.md#analytics)         |
   | Variable | `GOOGLE_SITE_VERIFICATION`       | Optional; only for meta-tag verification      |

   The publishable key is not secret in the strict sense (RLS limits it to published rows); it is a
   secret only to keep it out of logs and forks.

5. **Settings → Actions → General → Workflow permissions**: **Read repository contents**. Each
   workflow asks for more only where needed.
6. **Settings → Code security**: secret scanning, push protection, Dependabot alerts and security
   updates, private vulnerability reporting.
7. **Settings → Rules → Rulesets**: protect `main` against deletion and force pushes.

### 5.5 Admin `.env` for the real services

```sh
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
STORAGE_DRIVER=r2
MEDIA_BASE_URL=https://img.example.com
R2_ACCOUNT_ID=<32 hex characters>
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_MEDIA_BUCKET=<name>-media
R2_ORIGINALS_BUCKET=<name>-originals
GITHUB_REPO=<owner>/<repo>
GITHUB_TOKEN=github_pat_…
```

`GITHUB_TOKEN` is a **fine-grained personal access token** (GitHub **Settings → Developer settings**):

- Repository access: **only this repository**.
- Permissions: **Actions: Read and write** (deploy status, re-enable the daily build) and
  **Contents: Read and write** (required by GitHub to send `repository_dispatch`).
- Expiration: up to a year; put a reminder to rotate it (see [operations](operations.md#rotating-keys)).

### 5.6 First deploy

Push to `main` or run **Actions → Deploy site → Run workflow**. Then open the admin dashboard:
the **Public site** section lists the latest deploys. How deploys work day to day:
[operations](operations.md).
