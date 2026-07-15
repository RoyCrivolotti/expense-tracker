# Expense tracker

Personal budget and transaction tracker with cash reconciliation, card settlement modeling, and multi-scenario wealth projections. A live instance runs at **https://expenses.crivolotti.com** (Cloudflare Access + D1 allowlist — authentication does not mean access; the owner approves users in-app).

- **Cloudflare Access** (Google sign-in) — who can authenticate
- **D1 allowlist + in-app admin** — who can use the app (`/access/admin`)
- **Row-level tenancy** — each user's data is scoped by email in D1

Shared UI: [`folio-shell`](https://github.com/RoyCrivolotti/folio-shell) on [npm](https://www.npmjs.com/package/folio-shell) (`folio-shell@^1.0.4`).

## Features

| Area | Highlights |
| --- | --- |
| **Dashboard** | Monthly KPIs, budget health, card statements, Goals teaser, **Latest / Recently added** toggle |
| **Transactions** | **Date scope** (budget month, last 3 months, all dates, custom), filters, batch delete, recurring **Upcoming**, **per-day +** and **duplicate**, **statement payment rows** (derived), **header refresh** |
| **Analytics** | Budget vs actual, YTD on mobile, desktop tables, **cash recon gap split** (carryover / this month / total) |
| **Goals** | Multi-scenario net-worth projections, FIRE/housing controls, comparison charts |
| **Settings** | Categories, accounts, import/export, access admin (owner) |
| **Engine** | Derived transaction status (never stored), cash recon gap, deferred card settlement |
| **Offline** | IndexedDB snapshot, read-only banner, global refresh |

## Screenshots

Fixture data (`fixtures/demo-expenses.csv`). A **full gallery** (Goals deep dives, transaction filter states, access admin, light mode) lives in [docs/SCREENSHOT-GALLERY.md](./docs/SCREENSHOT-GALLERY.md).

**Dark mode** (default):

| Dashboard (desktop) | Dashboard (mobile) |
| --- | --- |
| ![Dashboard desktop](./docs/screenshots/gallery/dashboard-desktop.png) | ![Dashboard mobile](./docs/screenshots/gallery/dashboard-mobile.png) |

| Transactions (desktop) | Transactions (mobile) |
| --- | --- |
| ![Transactions desktop](./docs/screenshots/gallery/transactions-desktop.png) | ![Transactions mobile](./docs/screenshots/gallery/transactions-mobile.png) |

| Analytics (desktop) | Analytics (mobile) |
| --- | --- |
| ![Analytics desktop](./docs/screenshots/gallery/analytics-desktop.png) | ![Analytics mobile](./docs/screenshots/gallery/analytics-mobile.png) |

| Goals (desktop) | Goals (mobile) |
| --- | --- |
| ![Goals desktop](./docs/screenshots/gallery/goals-desktop.png) | ![Goals mobile](./docs/screenshots/gallery/goals-mobile.png) |

| Settings (desktop) | Settings (mobile) |
| --- | --- |
| ![Settings desktop](./docs/screenshots/gallery/settings-desktop.png) | ![Settings mobile](./docs/screenshots/gallery/settings-mobile.png) |

Regenerate: `npm run capture:screenshots` (Playwright + Chromium). Writes to `docs/screenshots/gallery/`.

## Local dev

```bash
git clone https://github.com/RoyCrivolotti/expense-tracker.git
cd expense-tracker
npm install
npm run dev
```

Opens at `http://localhost:5173` with **read-only CSV data** from `fixtures/demo-expenses.csv` (copied to gitignored `content/` on start). Production uses the D1-backed API.

To point dev at your own workbook export, set `FINANCIAL_REVIEW_DIR` to a directory containing `data/expenses_v3.csv` before `npm run dev`.

`/access/admin` works against a deployed API, or with `DOCS_CAPTURE=1` mocks (`npm run capture:screenshots`).

Copy [`.env.example`](./.env.example) → `.env` for hub cross-links (`VITE_*_URL`).

## Self-hosting

Example configs are in the repo; your values go in gitignored copies:

| Example | Copy to | Purpose |
| --- | --- | --- |
| [`config/access.example.json`](config/access.example.json) | `config/access.json` | Owner email → `OWNER_EMAIL` Pages env |
| [`config/allowed-emails.example.json`](config/allowed-emails.example.json) | `config/allowed-emails.json` | Bootstrap D1 allowlist |
| [`config/backup-alerts.example.json`](config/backup-alerts.example.json) | `config/backup-alerts.json` | Optional backup alert recipients |
| [`config/goal-scenarios.seed.example.json`](config/goal-scenarios.seed.example.json) | `config/goal-scenarios.seed.json` | Demo or private goal scenarios → `npm run seed:scenarios` |

```bash
npm run verify
cp config/access.example.json config/access.json   # edit ownerEmail
npm run sync:access-env
npm run bootstrap:allowed-users   # when seeding allowlist
npm run deploy
```

Full DNS, Access, D1, and CI setup: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Docs

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — hosting, access control, migrations through `0008`
- [docs/SCREENSHOT-GALLERY.md](docs/SCREENSHOT-GALLERY.md) — full UI screenshot reference
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — recent product changes (July 2026)
- [docs/GOALS-MODEL.md](docs/GOALS-MODEL.md) — wealth projection assumptions
- [docs/OPS.md](docs/OPS.md) — staging, backups, ops scripts
- [docs/TESTING.md](docs/TESTING.md) — unit and API integration tests

## License

Proprietary — see [LICENSE](./LICENSE). Source is public for transparency; unauthorized use is prohibited.
