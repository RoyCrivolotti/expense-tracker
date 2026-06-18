# Deployment — expense-tracker

## URL

| Surface | URL | Cloudflare Pages project |
| --- | --- | --- |
| Expense tracker | **https://expenses.crivolotti.com** | `expense-tracker` |

## DreamHost DNS (one-time)

Add a CNAME in the `crivolotti.com` zone:

| Record name | Type | Target |
| --- | --- | --- |
| `expenses` | CNAME | `expense-tracker-3hq.pages.dev` |

Then add **expenses.crivolotti.com** as a custom domain on the `expense-tracker` Pages project (Cloudflare dashboard → Workers & Pages → expense-tracker → Custom domains).

## Cloudflare Access

Add **expenses.crivolotti.com** to the existing **roy-admin** Access application (Zero Trust → Access → Applications → roy-admin → add public hostname). Same Google allowlist as the admin hub.

## D1 + ALLOWED_EMAILS

Bindings live on the **expense-tracker** Pages project (not roy-admin). Database name: `roy-expenses`.

```bash
# One-time: create Pages project + bind D1 (see Cloudflare API in repo history or dashboard)
# Migrate binding OFF roy-admin ONTO expense-tracker when cut over.

npm run sync:allowed-users   # reads config/allowed-emails.json
```

## CI

Push to `main` → verify + deploy **this repo only**. Copy `CLOUDFLARE_API_TOKEN` from the old monorepo secrets.

## Migrations

Add `migrations/NNNN_*.sql`, apply manually:

```bash
npx wrangler d1 execute roy-expenses --remote --file=migrations/NNNN_name.sql
```

## Old URL

`https://roy-admin.crivolotti.com/expenses.html` redirects to this app (301 configured in admin-hub `_redirects`).
