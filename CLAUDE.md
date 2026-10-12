# CLAUDE.md — blog-soy1limon

Guidance for AI coding agents (and humans) working in this repository.
**This file overrides the owner's global preferences where they conflict.**

## Project in one paragraph

Bilingual (English/Spanish content) personal blog. The public site is a static Astro build deployed
to GitHub Pages. Content lives in Supabase (Postgres) so drafts never reach this public repo. Images
are processed locally (Sharp + exiftool) and served from Cloudflare R2. Writing and uploading happen
in an admin app that only runs on the owner's machine (localhost). Full plan: `docs/roadmap.md`.

## Non-negotiable conventions

- **Everything in English**: code, identifiers, comments, docs, commit messages, PR text.
  (Blog _content_ may be Spanish or English; the codebase may not.)
- **pnpm only. Never run `npm` or `npx`** (use `pnpm exec` / `pnpm dlx`). Supply-chain reasons.
- New dependency install scripts stay blocked unless explicitly allowed in `pnpm-workspace.yaml`
  (`allowBuilds`). Justify every `true` there with a comment.
- **Public repository**: never commit secrets, real `.env` files, database dumps, original photos or
  anything under `backups/` or `.media-local/`. Only `*.env.example` templates with empty values.
  A photo used as a test asset must be stripped first (`exiftool -all=`) and checked for GPS.
- CI must keep working without secrets on pull requests. Never use `pull_request_target`.
  Pin third-party GitHub Actions to a full commit SHA with the version in a trailing comment.
- TypeScript is `strict` with `noUncheckedIndexedAccess`. No `any`, no non-null assertions to
  silence the compiler — narrow types instead.
- Validate every boundary with zod (env vars, form input, DB rows from untrusted sources).
- The real Supabase project is shared state: never run `db:push`, `db reset --linked` or writes
  against it without the owner's explicit approval. Tests only ever target the local stack.
- Accessibility is a functional requirement (WCAG 2.2 AA): semantic HTML first, every interactive
  control keyboard-operable, every image has alt text in the page language.
- Only `DEPLOY_ENV=production` builds (deploy workflow) may be indexed or load analytics; never
  set it locally or in tests.
- Tests never talk to the real GitHub repository: the admin e2e server blanks `GITHUB_REPO` and
  `GITHUB_TOKEN`. Deploy logs are public, so the deploy workflow only uses the publishable key.
- Comments explain _why_, not _what_. Keep them short.
- Commit at the end of every phase (owner's standing instruction), after all checks pass.
  Never push unless asked. Commit messages: short, clear, English.

## Workflow

- Work **one roadmap phase at a time** (`docs/roadmap.md`). At the end of a phase: run all checks,
  update the related docs, update "Current status" below, commit, and stop for review.
- Styling (Tailwind, iOS look) is deliberately the **last** phase. Before it, ship semantic,
  accessible, unstyled HTML.
- Verify library APIs against current official docs before using them; versions move fast.
  Turborepo ships version-matched docs in `node_modules/turbo/docs/`.

## Commands

| Command                             | What it does                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm install`                      | Install deps and git hooks (lefthook)                                |
| `pnpm lint` / `pnpm lint:fix`       | ESLint over the whole repo                                           |
| `pnpm format` / `pnpm format:check` | Prettier                                                             |
| `pnpm typecheck`                    | `tsc` in every package (Turborepo) + root config files               |
| `pnpm test`                         | Vitest across all packages (projects defined in `vitest.config.ts`)  |
| `pnpm build` / `pnpm dev`           | Turborepo build / dev for all apps                                   |
| `pnpm secrets:scan`                 | gitleaks over the full git history                                   |
| `pnpm db:start` / `pnpm db:reset`   | Local Supabase stack / rebuild it from migrations + seed             |
| `pnpm db:types`                     | Regenerate DB types after a migration (CI checks they are current)   |
| `pnpm test:integration`             | RLS + query tests; needs the local stack running                     |
| `pnpm media process <file>`         | Run the image pipeline locally into `media-out/` (uploads nothing)   |
| `pnpm admin` / `pnpm admin:dev`     | Local admin on http://127.0.0.1:4322 (build+start / dev server)      |
| `pnpm test:e2e`                     | Admin (local stack) and public site (fixtures) e2e, Playwright + axe |
| `pnpm web`                          | Public site dev server on http://localhost:4321                      |

## Layout

```
apps/web        Public static site (Astro)            — phase 5+
apps/admin      Local-only admin (Astro SSR + Vue)    — phase 3+
packages/core   Shared schemas, config, pure helpers
packages/db     Supabase clients, queries, fixtures   — phase 1+
packages/media  Image pipeline + CLI                  — phase 2+
packages/markdown  Shared Markdown pipeline           — phase 4+
supabase/       Migrations and local stack config     — phase 1+
docs/           Roadmap, setup, operations, ADRs (docs/adr)
```

Internal packages export TypeScript source directly (no build step); apps compile them.

## Current status

- [x] Phase 0 — Foundation
- [x] Phase 1 — Data layer (migrations local; pushed to the real project only after owner approval)
- [x] Phase 2 — Media pipeline
- [x] Phase 3 — Admin: shell + media
- [x] Phase 4 — Admin: posts
- [x] Phase 5 — Public site
- [x] Phase 6 — SEO
- [x] Phase 7 — Deploy & operations
- [x] Phase 8 — Quality pass (automated; the owner's NVDA pass is in docs/accessibility.md)
- [ ] Phase 9 — Styling
