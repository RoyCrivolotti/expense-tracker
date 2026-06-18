# Deployment — expense-tracker

## URL

| Surface | URL | Cloudflare Pages project |
| --- | --- | --- |
| Expense tracker | **https://expenses.crivolotti.com** | `expense-tracker` |

## DreamHost DNS (one-time)

| Record name | Type | Target |
| --- | --- | --- |
| `expenses` | CNAME | `expense-tracker-3hq.pages.dev` |

Add **expenses.crivolotti.com** as a custom domain on the expense-tracker Pages project.

## Cloudflare Access

Add **expenses.crivolotti.com** to the **roy-admin** Access application (same Google allowlist as admin-hub).

## D1 + ALLOWED_EMAILS

D1 binding lives on the **expense-tracker** Pages project. Database name: `roy-expenses`.

**Local:** copy `config/allowed-emails.example.json` → `config/allowed-emails.json` (gitignored).

**CI:** set GitHub secret `ALLOWED_EMAILS` (JSON array or comma-separated emails).

```bash
npm run sync:allowed-users
```

## CI

Push to `main` → verify → `sync:allowed-users` → deploy.

Secrets: `CLOUDFLARE_API_TOKEN`, `ALLOWED_EMAILS`.

## Migrations

```bash
npx wrangler d1 execute roy-expenses --remote --file=migrations/NNNN_name.sql
```

## Old URL

`https://roy-admin.crivolotti.com/expenses` redirects here (301 in admin-hub `_redirects`).

## Public repo?

See [PUBLIC_READINESS.md](./PUBLIC_READINESS.md) before changing repository visibility.
