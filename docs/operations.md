# Operations

Day-to-day running of the live blog: deploys, scheduled posts, backups, keys and limits.
First-time setup of the cloud services is in [setup](setup.md#5-cloud-services).

## How the site gets deployed

`.github/workflows/deploy.yml` builds `apps/web` from the **published** rows in Supabase (read with
the publishable key, so RLS hides drafts and future posts) and deploys it to GitHub Pages.

| Trigger               | When                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `repository_dispatch` | The admin sends it after a change that affects the public site (see below), and from **Rebuild site** |
| `schedule`            | Every day at 12:17 UTC (06:17 in Monterrey)                                                           |
| `push` to `main`      | Code changes                                                                                          |
| `workflow_dispatch`   | **Actions → Deploy site → Run workflow** on GitHub                                                    |

What the admin does on its own:

| Action in the admin                                 | Rebuilds the site?                               |
| --------------------------------------------------- | ------------------------------------------------ |
| Publish now, or update a published post             | Yes                                              |
| Unpublish, archive or delete a post that was online | Yes                                              |
| Restore a revision of a published post              | Yes                                              |
| Edit or restore an image used by a published post   | Yes                                              |
| Schedule a post                                     | No: the first daily build after its date does it |
| Anything on drafts or unused images                 | No                                               |

The editor says whether a rebuild started. A deploy takes about two minutes; the dashboard's
**Public site** section lists the latest runs with links to their logs.

Only one deploy runs at a time. A running deploy is never cancelled, and while it runs GitHub keeps
only the newest waiting one, so several quick edits end in a single build with all of them.

### Scheduled posts

A post scheduled for 10:00 becomes visible with the first build after 10:00: the next daily build,
or any earlier one (another publish, **Rebuild site**). For an exact time, press **Rebuild site**
right after the scheduled moment.

### The daily build was disabled

GitHub disables scheduled workflows in public repositories after 60 days without commits. The admin
checks this the first time the dashboard loads and re-enables the workflow through the API (the
dashboard says so). A workflow disabled by hand is left alone; the dashboard shows a warning with a
link to enable it.

### A deploy failed

The previous version stays online: Pages only switches after a successful deploy. Open the failed
run from the dashboard. Common causes:

| Symptom in the log                               | Fix                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `Invalid environment for the public site build`  | A repository secret or variable is missing; see setup §5.4           |
| Connection errors or timeouts against Supabase   | The project is paused or down; see below                             |
| `has no alt text in` / content validation errors | Fix the post or image in the admin; the build refuses broken content |
| Errors in `pnpm install`                         | A dependency problem; reproduce locally with `pnpm install`          |

Then press **Rebuild site**.

## Supabase paused

Free projects pause after 7 days without activity. The daily build queries the database, which
keeps it awake. If it pauses anyway (for example, while the daily build was disabled):

1. The public site keeps working; only new deploys fail.
2. Open the project in the Supabase dashboard and press **Restore project** (takes a few minutes).
3. Press **Rebuild site** in the admin.

## Backups and restore

```sh
pnpm db:backup   # writes backups/<timestamp>-schema.sql and -data.sql (git-ignored)
```

Run it before every `pnpm db:push` and from time to time (for example, monthly). Copy the files
somewhere safe outside the repository; they contain drafts.

Restore into an **empty** project (a new one, or after confirming you want to overwrite):

```sh
pnpm exec supabase link --project-ref <new-project-ref>
psql "<connection string from Project Settings → Database>" -f backups/<stamp>-schema.sql
psql "<connection string>" -f backups/<stamp>-data.sql
```

Images are not in the database dump. They live in R2: public variants in the media bucket and the
untouched uploads in the originals bucket. Any variant can be regenerated from its original with
**Save changes** on the image page. To keep an offline copy of the originals, download the bucket
with any S3-compatible tool using an R2 token with read access.

## Rotating keys

Rotate a key once a year, when a token expires, or immediately if it may have leaked.

| Key                           | Where to create the new one                                  | Where it goes                            | Then                                  |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------- |
| Supabase secret key           | Supabase → Project Settings → API Keys → new secret key      | `apps/admin/.env`                        | Delete the old key in Supabase        |
| Supabase publishable key      | Same page, new publishable key                               | GitHub secret `SUPABASE_PUBLISHABLE_KEY` | Rebuild site, then delete the old key |
| R2 access key                 | Cloudflare → R2 → Manage API tokens                          | `apps/admin/.env`                        | Delete the old token                  |
| GitHub token (`GITHUB_TOKEN`) | GitHub → Settings → Developer settings → Fine-grained tokens | `apps/admin/.env`                        | Revoke the old token                  |

Restart the admin after editing its `.env`. If a secret was committed by mistake, rotate it first;
rewriting git history does not help once the commit was pushed to a public repository.

## Limits of the free tiers

| Service        | Limit that matters here                       | Where to watch                       |
| -------------- | --------------------------------------------- | ------------------------------------ |
| Cloudflare R2  | 10 GB stored; 1 M writes and 10 M reads/month | Admin dashboard meter; Cloudflare R2 |
| Supabase       | 500 MB database; pauses after 7 idle days     | Supabase dashboard → Usage           |
| GitHub Pages   | 1 GB site; ~100 GB traffic/month (soft)       | Images are on R2, so pages stay tiny |
| GitHub Actions | Free for public repositories                  | —                                    |

Image egress is free on R2 and cached by Cloudflare, so traffic spikes cost nothing.

Files left behind when an image is renamed or edited ("retired" files) still count towards the R2
storage. Delete them from the image page once the site was rebuilt; the admin refuses while a
published post may still point at them.

## Visit statistics

Cloudflare Web Analytics only runs on production deploys. To leave your own visits out, open
`https://<domain>/?analytics=off` once per browser and device ([details](seo.md#analytics)).
