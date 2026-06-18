# Expense tracker

Live budget and transaction tracker at **https://expenses.crivolotti.com** (Cloudflare Access + D1).

Proprietary — see [LICENSE](./LICENSE).

Shared UI: [`site-ui`](https://github.com/RoyCrivolotti/site-ui) (pinned `v1.0.0` in CI).

## Local dev

```bash
# From ~/Repos/personal
./link-site-ui.sh && npm install
cd expense-tracker
cp config/allowed-emails.example.json config/allowed-emails.json   # first time only
npm run dev
```

Set `FINANCIAL_REVIEW_DIR` for real CSV from finance-review.

## Verify & deploy

```bash
npm run verify
npm run sync:allowed-users   # needs CLOUDFLARE_API_TOKEN + allowed emails
npm run deploy
```

Secrets: `CLOUDFLARE_API_TOKEN`, `ALLOWED_EMAILS` (CI).

## Docs

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — DNS, Access, D1
- [docs/PUBLIC_READINESS.md](docs/PUBLIC_READINESS.md) — before making repo public

Workspace: `~/Repos/personal/ARCHITECTURE.md`, `AGENTS.md`.
