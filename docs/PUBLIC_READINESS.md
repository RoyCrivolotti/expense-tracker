# Security & data boundaries

The **source repo** is public. The **live app** at expenses.crivolotti.com remains invite-only (Cloudflare Access + D1 allowlist).

## What is safe in git

- Application code, migrations, docs, screenshots (fixture data only)
- Example configs (`config/*.example.json`) and test emails like `owner@example.com`
- Public hostnames in docs

## What stays private

| Item | Where it lives |
| --- | --- |
| Real expense data | D1 (per-user rows) |
| Email allowlist | D1 `allowed_users`; bootstrap via gitignored `config/allowed-emails.json` or CI secret |
| Owner email | Gitignored `config/access.json`; CI `OWNER_EMAIL` secret |
| Personal workbook CSV | Gitignored `content/`; optional `FINANCIAL_REVIEW_DIR` for local dev |
| Daily backups | R2 (`{email}/YYYY-MM-DD.json`) |
| Deploy credentials | GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, …) |

## `config/access.json`

Copy from [`config/access.example.json`](../config/access.example.json):

```json
{ "ownerEmail": "you@example.com" }
```

Used by `npm run sync:access-env` to set **`OWNER_EMAIL`** on Cloudflare Pages (owner admin UI). Not an API key and not the user allowlist.

**Shared UI:** [`folio-shell`](https://github.com/RoyCrivolotti/folio-shell) on [npm](https://www.npmjs.com/package/folio-shell).

## History hygiene

Obsolete email-approve files were stripped from git history (2026-06-19). Before trusting a fork or old clone, spot-check:

```bash
git log --all -S 'accessNotifier' --oneline       # expect empty
git log --all -S 'ApproveAccessScreen' --oneline  # expect empty
rg '@gmail\.com' --glob '!docs/**' --glob '!*.example.*'  # expect no matches in tracked source
```

After a history rewrite, re-clone rather than pull.
