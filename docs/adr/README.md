# Architecture decision records

Short notes on decisions that shape the project: the context, what was decided and what it costs.
New decisions get the next number; a reversed decision is marked _Superseded_ and links to its
replacement instead of being deleted.

| #                                           | Decision                                          |
| ------------------------------------------- | ------------------------------------------------- |
| [0001](0001-static-site-on-github-pages.md) | Static site on GitHub Pages                       |
| [0002](0002-content-in-supabase.md)         | Content in Supabase, read through RLS             |
| [0003](0003-local-only-admin.md)            | Admin runs only on the author's machine           |
| [0004](0004-images-on-r2.md)                | Images processed locally, served from R2          |
| [0005](0005-deploy-triggers.md)             | Deploys triggered by the admin plus a daily build |
