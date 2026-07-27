# Architecture — expense-tracker

Ports-and-adapters (hexagonal). The domain layer knows nothing about D1, HTTP, or React; UI and
Functions are both adapters around it.

## Layers

| Layer | Location | Depends on | Knows about |
| --- | --- | --- | --- |
| **Engine** (pure compute) | `src/domain/engine/` | Nothing | Money formatting, dates, budget totals, cash reconciliation, transaction status, goals math |
| **Ports** (interfaces) | `src/domain/ports/` | Domain types only | `ExpenseRepository`, `AccessRepository`, `AuthProvider`, `BackupStore`, `EmailSender` — shapes the UI and Functions code against, never a vendor SDK |
| **Application** (use cases) | `src/domain/application/` | Ports, engine | Orchestration that needs more than one repository call (`installmentPlanService`, `transactionService`, `goalService`, `categoryService`) |
| **Data** (parsing) | `src/domain/data/` | Domain types | CSV import/export parsing, transaction ID helpers — pure, no I/O |
| **Adapters — backend** | `functions/_shared/adapters/` | Ports | `d1ExpenseRepository`, `d1AccessRepository`, `r2BackupStore`, `cloudflareEmailSender`, `cloudflareAccessAuth` |
| **Adapters — frontend** | `src/data/`, `src/testing/` | Ports | `apiDataSource` (HTTP client), `csvDataSource`, `inMemoryExpenseRepository` (test double) |
| **Driving side — API** | `functions/api/` | Application, ports | Cloudflare Pages Functions HTTP handlers |
| **Driving side — UI** | `src/ui/` | Application, engine, data | React components; no direct D1/HTTP, always through `src/data/` |

`src/engine/`, `src/types.ts`, and similar top-level re-export barrels exist only so older imports
keep working — the real implementation is always in `src/domain/`. Prefer importing from
`src/domain/` directly in new code.

## Invariants worth knowing before you change them

- **Transaction status is derived, never stored.** `src/domain/engine/status.ts` computes
  overdue/due-soon/paid from dates and settings on every read. There is no `status` column — if you
  find yourself wanting to persist one, that's a signal the derivation logic needs fixing instead.
- **Row-level tenancy via `owner`.** Every table keyed by `owner` (the authenticated email); every
  D1 query in `functions/_shared/adapters/d1ExpenseRepository.ts` filters by it. New tables and
  new queries must follow the same shape — a query without an `owner` predicate is a cross-tenant
  data leak.
- **Currency/number-format settings are display-only.** They change symbol and decimal separator
  for every transaction (past and future); amounts are stored as locale-neutral integer cents and
  are never converted. See `src/domain/engine/money.ts`.
- **In-memory repository mirrors the D1 adapter's validation and FK behavior.**
  `src/testing/inMemoryExpenseRepository.ts` is a full test double, not a stub — when you add
  validation or a cascade/unlink behavior to the D1 adapter, add the same behavior here or tests
  will pass against the double while the real backend rejects (or worse, silently corrupts) the
  same input.
- **Categories and accounts with references are deleted only via reassign, never orphaning a
  record.** An unused category/account deletes outright; one still referenced by a transaction,
  installment plan, or (for accounts) an account statement requires a `reassignToId` or an inline
  `createCategory`/`createAccount` payload. The reassign (move referencing rows) + delete run as a
  single `env.DB.batch(...)`, so a mid-batch failure can't leave rows pointing at a deleted id. An
  inline create is **not** part of that batch — D1 can't reference a statement's own result (the
  new row's id) from a later statement in the same `batch()` call, so the create runs first as its
  own statement, then the batch. If the batch then fails, the newly-created category/account is
  cleaned up on a best-effort basis (not itself atomic with the failure) rather than left behind
  unused. See `deleteCategory`/`deleteAccount` in `functions/_shared/dbConfig.ts`. Archiving
  (`active: false`) is unrelated and never blocked by usage — it only affects which
  categories/accounts new/edited transactions can pick, not deletion.
- **Reassign targets (existing records to move to) must be active.** Both the reassign-target
  dropdown and the pickers in `TransactionFields`/`InstallmentPlanForm` exclude inactive
  categories/accounts — same "active = archive" rule in both directions: don't offer linking new
  data to something archived. The one standing exception is a form's own current value: an
  already-linked (possibly inactive, or in rare legacy-data cases fully deleted) category/account
  stays selectable so editing an unrelated field never breaks the form. See
  `src/ui/components/pickerOptions.ts`.
- **Public GitHub source.** Real emails (beyond a clearly-named demo account), financial figures,
  and other personal identifiers must never land in a tracked file. Follow the placeholder +
  comment pattern already used in `migrations/0003_multi_user.sql` and
  `0011_user_preferences.sql`: commit a placeholder (`owner@example.com`) with a comment telling
  whoever applies the migration to substitute the real value first. Real per-deployment config
  stays gitignored with a committed `*.example.json` sibling, e.g.
  [`config/access.example.json`](../config/access.example.json). `npm run verify` (and therefore
  both CI workflows) runs `scripts/check-pii.mjs`, which fails the build on any tracked-file email
  outside an explicit allowlist — extend the allowlist there by exact address, not by domain,
  when adding a new legitimately-safe one.

## Size and complexity

ESLint enforces `max-lines: 200`, `max-lines-per-function: 60`, `complexity: 12`, `max-depth: 3`
(see `eslint.config.js`). These aren't arbitrary: they're a proxy for "this file/function is doing
one thing." Split before disabling.

## Testing

See [docs/TESTING.md](./TESTING.md) for the test pyramid and how to exercise each layer.
