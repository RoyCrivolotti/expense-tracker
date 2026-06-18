# Expense tracker

Live budget and transaction tracker at **https://expenses.crivolotti.com** (Cloudflare Access + D1).

Part of the split personal-site family. Shared UI lives in [`site-ui`](https://github.com/RoyCrivolotti/site-ui).

## Local dev

```bash
# From ~/Repos/personal (workspace) or with site-ui checked out to ./site-ui
npm install
npm run dev
```

Uses bundled CSV from `finance-review` when D1 is unavailable. Set `FINANCIAL_REVIEW_DIR` for `prep-expenses-data.mjs`.

## Verify & deploy

```bash
npm run verify
npm run deploy   # → Cloudflare Pages project expense-tracker
```

## Docs

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for DNS, Access, and D1 setup.
