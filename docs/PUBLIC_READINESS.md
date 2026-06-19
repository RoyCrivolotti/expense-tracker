# Public repository readiness

The **live app** at expenses.crivolotti.com stays private (Cloudflare Access + D1 allowlist). This doc covers whether the **source repo** can be made public.

## Verdict: public-ready (HEAD)

Application code, fixtures, migrations, and **current HEAD** use placeholders only. No real transactions, emails, or API keys are committed.

## Before `gh repo edit --visibility public`

| Item | Status |
| --- | --- |
| Real email allowlist | Gitignored — `config/allowed-emails.json`; CI uses `ALLOWED_EMAILS` secret |
| Owner email | Gitignored — `config/access.json` (`ownerEmail` only); CI uses `OWNER_EMAIL` secret |
| Personal finance CSV | Gitignored under `content/`; dev copies from finance-review |
| Migration backfill email | Placeholder `owner@example.com` in `0003_multi_user.sql` |
| Test fixtures | `*@example.com` only |
| Cloudflare account / D1 IDs | In wrangler config and scripts — not secret, but identifies your account |
| Resend / email-approve path | Removed from HEAD; scrub from history before publish (see below) |
| Git history PII | Run [HISTORY_REWRITE.md](./HISTORY_REWRITE.md) before `gh repo edit --visibility public` |

## What `config/access.json` is

Gitignored local file — copy from `config/access.example.json`:

```json
{ "ownerEmail": "you@example.com" }
```

Used by `npm run sync:access-env` to set the **`OWNER_EMAIL`** Pages environment variable (who gets owner admin UI and pending-request badge). CI passes the same value via the `OWNER_EMAIL` GitHub secret instead of this file.

It does **not** contain API keys or allowlists. User allowlisting lives in D1 (`allowed_users`), bootstrapped from `config/allowed-emails.json` or the `ALLOWED_EMAILS` secret.

## Safe to publish (HEAD)

- Application code, migrations, docs, screenshots (mock data)
- Test emails like `owner@example.com`
- Public hostnames in docs

## Still private when repo is public

- D1 expense data (all users)
- R2 daily backups (`{email}/YYYY-MM-DD.json`)
- Cloudflare Access + allowlist enforcement
- GitHub Actions secrets

## History hygiene

After the brief email-approve experiment (never used in production), run `git filter-repo` per [HISTORY_REWRITE.md](./HISTORY_REWRITE.md) to drop obsolete access-notifier files and Resend references from all commits.

## After going public

Optional — keep the repo private if you prefer. Architecture is documented either way.
