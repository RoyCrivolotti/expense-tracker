# Changelog (product-facing)

High-signal UX and reliability changes on `main`. Internal refactors omitted unless they affect behavior.

## July 2026 (onboarding wizard fixes, category/account delete)

### Setup wizard

- **Re-entry no longer silently resets settings.** Re-opening the wizard from Settings used to seed
  the Money step from hardcoded defaults, quietly reverting currency, number format, and budget
  rollover day back to EUR/`de-DE`/day-13 even if you'd already changed them. It now seeds from
  your actual saved settings.
- **Adding a new debit account is opt-in on re-entry.** First run still always creates one debit
  account (you need at least one to use the app); re-opening the wizard later shows an "Add another
  debit account" checkbox instead of silently creating a duplicate.
- **Confirmation popup before "Finish setup"** lists what will be created (categories, accounts)
  and shows the currency, number format, and budget rollover day from the Money step — always shown
  even if unchanged, since only the fields that actually differ from your saved settings get
  written — before anything is applied. Includes a plain note that it doesn't check for duplicate
  categories, so re-running the wizard's Categories step will add to what you already have, not
  replace it.

### Categories & accounts

- **Delete a category or account**, from its edit screen. An unused one deletes outright; one still
  referenced by transactions, installment plans, or (for accounts) card statements offers a
  reassign-then-delete flow: move everything to another existing category/account, or create a new
  one inline (e.g. to fix a typo without leaving the delete flow) — the move and the delete happen
  together, so nothing is left half-reassigned. You can't delete your only remaining category or
  account.
- **New/edited transactions can no longer pick an inactive (archived) category or account** — the
  "Active" toggle now actually behaves like an archive for new entries. Editing a transaction still
  always shows its own current category/account even if it's since been archived, so editing any
  other field on that transaction never forces a reassignment. Every other view (filters, analytics,
  budget totals, CSV export) is unaffected and keeps showing archived categories/accounts as before.

## July 2026 (installments, currency, onboarding)

### Installments

- **Installment plans**: log a purchase once as a bounded N-payment schedule (e.g. a phone financed over 24 months) instead of re-entering it every month. Create a plan inline from the transaction form, or manage existing plans from the Transactions tab.
- **Due-soon reminders**: the Installments card surfaces payments due today or tomorrow (or with no known due day) for the viewed month; **Manage plans** stays reachable even when nothing is due right now.

### Currency and budget months

- **Settings → Money & months**: currency, number-format locale (comma vs dot decimals), and the day of the month the budget period rolls over are now per-tenant configuration instead of hardcoded EUR/`de-DE`/day-13 assumptions.
- The **setup wizard** collects these during first-run and can be re-opened any time from Settings to revisit them (also fixes categories/accounts started outside the wizard).

### Cash reconciliation

- **Reconciled badge** (✓) on a month's row once cash is entered and every card statement for that month is paid.

## July 2026 (reconciliation UX)

### Cash reconciliation

- **Gap split** on desktop and mobile: **Carryover**, **This month**, and **Total gap** columns replace a single opaque gap.
- Analytics copy explains how carryover vs this-month drift maps to reconciliation.

### Transactions

- **Statement payment rows** appear in the list when a deferred card statement is marked paid (derived from statement status + cash recon, not stored as transactions).
- **Header refresh** on every tab; pull-to-refresh on mobile. Toast on success or failure.

### Offline / PWA

- **IndexedDB snapshot** of the last successful load for read-only viewing when offline or when refresh fails.
- **Offline banner** distinguishes true offline vs online with stale cache; editing disabled until reconnect or refresh.

## July 2026

### Transactions

- **Date scope dropdown** replaces the old “filter by calendar date range” checkbox: budget month (default), last 3 months, all dates, or custom range anchored to the viewed month.
- **Per-day +** on date headers opens the add form with that calendar date pre-filled (FAB still adds for today).
- **Duplicate** — swipe left on a row (mobile) for **Copy**, or use **Duplicate** in the edit modal (desktop). Opens a new transaction with copied fields and a “Copied from …” hint. Swipe eases open/closed on release; tap an open row to close it.
- **Delete** (mobile swipe or batch select) uses an in-app confirm sheet with context.
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
