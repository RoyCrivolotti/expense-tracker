# Hold the ledger in parts and keep the engines in the browser

For an engineer deciding how the data layer should grow. The design is summarised in [SCALING.md](../SCALING.md).

**Context.** The engines in `src/domain/engine/` are pure functions over `Transaction[]` and the reference for every
number the app shows. The browser holds every transaction and runs them over all of it. On the Cloudflare Free plan the
first limit a full load would reach is the documented 10 ms of Worker CPU per request, spent building the one dataset
response. One account was seen not to enforce it, and the design does not rely on that
([SCALING.md](../SCALING.md#observed-on-a-free-account)). Some screens read years of history and some only the month on
screen ([ENGINE-HISTORY.md](../ENGINE-HISTORY.md)).

**Decision.** A ledger is the reference tables (held in full), the pinned rows (real at any age), real rows for the 13
newest months with data up to the month on screen, and one summed cell per (budget month, account, category, type,
cancelled, sign) for every other month. The engines are unchanged. They get `linear` (real rows plus one row per cell)
when they only add amounts, and `real` when they read dates, descriptions, links or whole series. A ledger of 5,000 rows
or fewer hydrates every month, so a small ledger behaves as it always has.

**Consequences.**
- One code path with two sizing policies. `ledgerDifferential.test.ts` and `ledgerSweep.test.ts` compare every consumer
  with the whole ledger and fail on any difference not listed in `src/testing/intendedDifferences.ts`.
- Engines that classify recurring charges need the whole history, so they take a classifier or series built from `GET
  /series` as an optional argument. Without one they answer differently on a window.

**Not chosen.**
- Engines on the server: the Worker's CPU is the documented scarce resource, and each screen's computation would move
  onto it.
- A synced local replica of the database: offline mode is a read-only snapshot with no sync, and a replica would still
  download the history the ledger exists to avoid.
