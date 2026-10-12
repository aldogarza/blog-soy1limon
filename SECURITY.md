# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub Security Advisories](../../security/advisories/new) for this repository.
Include steps to reproduce and the impact you expect. You will get an answer as soon as possible.

## Design notes relevant to security

- The admin application binds to the loopback interface only and is never deployed.
  It validates the `Host` header (DNS-rebinding protection) and the `Origin` of every mutation.
- The public site is static. Its build reads Supabase with the **publishable** key, and Row Level
  Security limits that key to published posts and non-sensitive image columns.
- Secrets live only in local `.env` files (git-ignored) and GitHub Actions secrets. A gitleaks
  pre-commit hook and a CI job scan for leaked credentials.
- Original photos (which may contain GPS data) are stored in a private R2 bucket. Public image
  variants have GPS metadata stripped by default.
