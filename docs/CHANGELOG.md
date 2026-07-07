# Changelog (product-facing)

High-signal UX and reliability changes on `main`. Internal refactors omitted unless they affect behavior.

## July 2026

### Transactions

- **Date scope dropdown** replaces the old “filter by calendar date range” checkbox: budget month (default), last 3 months, all dates, or custom range anchored to the viewed month.
- **Per-day +** on date headers opens the add form with that calendar date pre-filled (FAB still adds for today).
- **Duplicate** on each row (copy icon) and in the edit modal opens a new transaction with copied fields and a “Copied from …” hint — change type to refund and save.
- **Upcoming** recurring suggestions anchor monthly items to the viewed budget month (fixes missed suggestions when the prior charge landed in an earlier BM).
- **Upcoming** groups recurring patterns by category so subscription “Glovo” is not mixed with food orders sharing the same description.

### Dashboard

- **Recent activity** toggle: **Latest** (by transaction date) vs **Recently added** (by entry time).

### Analytics (mobile)

- YTD budget vs actual block and invested KPIs on the Summary segment.

### PWA / access

- Service worker no longer intercepts `/api` (fixes iOS auth failures).
- Access error screen shows copyable diagnostics; optional reload banner when a new build is available.

## June 2026 (Goals milestone)

- Goals tab: multi-scenario projections, FIRE/housing/rent-vs-buy charts, scenario show/hide, glossary.
- See [AUDIT-2026-06-GOALS.md](./AUDIT-2026-06-GOALS.md) for the full Goals review.
