# Testing — expense-tracker

For contributors writing or running tests. Stack: **Vitest** + **React Testing Library** (hooks) + in-memory D1 (Pages Functions).

## Commands

```bash
npm test              # all unit + integration tests
npm run test:coverage # same, plus a coverage report + global threshold check
npm run coverage:diff -- --base <sha>  # % of THIS diff's changed lines that are covered
npm run verify         # symlinks, migration docs, docs size, PII check, lint, typecheck, test:coverage, build, bundle budget
PARITY_TESTS=1 npm test   # optional parity test, needs a private export (see "Local parity tests")
```

## Layers

| Layer | Location | What it proves |
| --- | --- | --- |
| Domain / engine | `src/domain/**/*.test.ts` | Pure compute rules |
| Service / shared | `functions/_shared/**/*.test.ts` | Backup, auth, DB helpers |
| **API integration** | `functions/api/access/access.integration.test.ts`, `functions/api/expenses/expenses.integration.test.ts`, `functions/api/expenses/transactions/write.integration.test.ts` | Middleware + handlers + in-memory repo or D1 |
| Hub nav | `src/hubNavItems.test.ts` | Group grants → visible cross-app links |
| UI hooks | `src/ui/**/*.test.tsx` | Hook behaviour (RTL) |
| Real browser (manual) | `scripts/verify-goals-*.mjs` | The layout jsdom cannot do (see below) |

## Pages Function integration tests

Use `functions/_shared/testing/invokeApiRoute.ts` for access routes (real middleware + in-memory D1).

Use `functions/_shared/testing/invokeExpenseApiRoute.ts` for expense routes (real middleware + injected in-memory `ExpenseRepository`).

Use `functions/_shared/invokePagesRoute.ts` for transaction write validation against mocked D1 ownership checks.

Use `functions/_shared/testing/expenseWorld.ts` (with `seedLedger.ts`) to run the whole expense API over a real SQLite database: the real middleware, the real D1 repository, and a log of every statement a request ran. The caller supplies the database, because the `functions/` typecheck has no Node types.

Example flows in `access.integration.test.ts`:

1. Owner reads all groups on `GET /api/access/grants`
2. Approve grants **expenses only** by default
3. Owner PATCH toggles finance/legacy/oncall; removing expenses purges D1 expense rows
4. Expense API returns 403 without the expenses group; access API still works

When adding a new protected route or group rule, extend that file first.

### Testing D1 batch atomicity

`functions/_shared/dbConfig.deleteWithReassign.test.ts` stubs `env.DB.batch()` to assert both the
exact statements sent (so reassignment SQL stays owner-scoped) and that a rejected batch surfaces
as an error with zero partial writes. Reuse that `stubEnv()` helper for any future D1 adapter
change that must be all-or-nothing.

## Running the real SQL locally, and measuring scale

- `src/testing/sqliteD1.ts` and `seedSqlite.ts`: the real migrations and a D1-shaped wrapper over node:sqlite, so the real
  SQL runs in tests without Cloudflare. It rejects a statement that binds more than 100 values, as D1 does
  (`maxBoundParameters` changes that), but it cannot reproduce D1's billing or its limit of five terms in a compound
  `SELECT`. They live in `src/testing/` because the `functions/` typecheck has no Node types.
- `src/testing/syntheticLedger.ts`: a deterministic dataset of any size, in the shape and order the API returns, with fixed,
  quarterly and yearly series, plan instalments, flagged rows settled by a refund, negative investments, cancelled rows and
  refunds. Placeholder data only.
- `src/domain/ledger/partsOfDataset.ts`: the ledger parts computed from a whole dataset, which the SQL is held to
  (`dbLedgerParts.parity.test.ts`).
- `src/testing/transactionQueryKit.ts`: the awkward ledger (accents, `%` and `_`, ties on a date, withdrawals, a missing
  account), a stand-in that records every statement it ran, and a seeded generator of filters, for the paged-read tests.
- `*.scaling.test.ts` print what a route costs by ledger size when run with `SCALING_MEASURE=1` and `--reporter=verbose`
  (the command for the load path is in [SCALING.md](./SCALING.md)). The query-plan tests (`*Plans.test.ts`) run each statement through `EXPLAIN QUERY PLAN` and fail on a full scan of `transactions`.

## Real-browser checks (manual)

jsdom lays nothing out, so the unit tests for the Goals phone navigation and the section tabs write down every position they depend on. Five Playwright scripts measure the real thing in headless Chromium, on the `DOCS_CAPTURE=1` demo instance (seeded demo data, nothing real). Each starts its own dev server and stops it again. They are run by hand, need Chromium (`npx playwright install chromium`) and take a minute or a few, so none is part of `npm run verify` or CI.

| Command | What it checks |
| --- | --- |
| `npm run verify:goals-tabs` | The secondary chart picker on Goals' Chart view does not overlap at 390px. Serves on port 5173. |
| `npm run verify:goals-nav` | The Goals phone navigation at 375x812 and 320x568, plus landscape and large text: the view row sticks under the header, the hero chart is above the bottom bar on first load, each Scenarios chip lands its section under the pinned stack, the marked chip follows the scroll and a tapped chip stays marked until the viewer scrolls, each view comes back where it was left (also after a link), the four labels are shown whole, Scenarios is not pinned on a short screen, and no control that Tab or Shift+Tab reaches is covered by the header, the row, the stack or the bottom bar. |
| `npm run verify:goals-desktop` | The wide Goals Plan page from 1024px to 1920px, in Chromium and (with `ENGINES=chromium,webkit`) in Safari's engine. It checks the layout, the levers bar, the scenario menu, the charts and tables and the toasts; what it measures is listed in the header of `scripts/verify-goals-desktop.mjs`. |
| `npm run verify:section-tabs` | The Analytics and Settings section tabs at 375x812 and 320x568: the bar sticks under the header at 44px (36px on a desktop with a mouse) with a fade beneath it, a section tapped from down the page lands its content flush under the bar, comes back where it was left, and the four labels ("Preferences" included) are shown whole with no sideways scroll; and no control that Tab or Shift+Tab reaches is covered by the header, a section bar, the Transactions bar or a day heading, or the bottom bar, on the dashboard, Transactions, Analytics and Settings at 375x812 and 1100x800. |
| `npm run verify:ledger-mode` | The screens read from the ledger in parts show what the whole dataset shows. In Chromium and WebKit, at 375x812 and 1280x800, it compares the text of the dashboard, Analytics (Overview, Spending and Cash, for the newest month and one four months older), Goals (its opening view and Progress), Transactions (this month, over every date, and searched) and the card statements in Settings between `?ledger=off` and `?ledger=on`, and requires `?ledger=shadow` to report no differences. Serves on `CAPTURE_PORT`. |

`verify:goals-desktop` is run the same way (`CAPTURE_PORT=5490 npm run verify:goals-desktop`, a few minutes, `ENGINES=chromium,webkit` for both engines) after changing `src/ui/tabs/goals/desktop/`, the scroll padding the levers bar sets, or the Goals page width in the app shell. CI runs it too (`.github/workflows/verify-goals-browser.yml`: Chromium on Linux and WebKit on macOS, since the Linux build of WebKit does not scroll or focus like Safari's; about ten minutes each, no retry) on a PR that touches `src/ui`, `src/domain` or `src/data`, and on main after a merge, since two PRs that pass it alone can break it together. It is a separate check from Verify and is not required by branch protection yet.

`verify:goals-nav` prints one line per measurement and exits 1 with what it measured for any that fail. It serves on `CAPTURE_PORT` (5173 unless set, as `npm run capture:screenshots` does) and refuses to run if something already answers there, since it would be measuring someone else's code: `CAPTURE_PORT=5490 npm run verify:goals-nav`. Run it after changing `src/ui/tabs/goals/`, `SegmentedControl` or the app shell's header or bottom bar, since a unit test cannot see most of what those break. `verify:section-tabs` is run the same way (`CAPTURE_PORT=5490 npm run verify:section-tabs`, a few minutes) after changing `SectionTabs`, the scroll padding in `theme.css`, or what sticks under the header in Transactions.

## Coverage gate

Two separate checks, both run in CI (`.github/workflows/verify.yml`) on every PR:

1. **Global floor** — `vitest.config.ts`'s `coverage.thresholds`, measured with `coverage.include`
   covering every `src/**`, `functions/**` and `workers/**` file, tested or not — an
   untested file counts as 0%, it doesn't just vanish from the denominator. The
   vitest harness under `src/test/` is excluded, being the thing that runs the
   tests rather than anything that ships).
   These are loose on purpose: statements, branches, functions and lines are 95.6, 90.8,
   94.9 and 97.0 percent (2026-10-23) against floors of 88, 83, 87 and 90, so they catch
   the loss of a large share of the tests and not a slow slide. Raise them if the global
   number should be held more tightly. This check only catches the *overall* number
   regressing; it fails `npm run verify` locally too, since `verify` runs `test:coverage`.
2. **Diff coverage** — `scripts/check-diff-coverage.mjs` parses `coverage/lcov.info`
   plus `git diff --unified=0 <base>...HEAD` to compute what % of *this PR's
   added/changed* `.ts`/`.tsx` lines are covered, and fails below 90%
   (`DIFF_COVERAGE_THRESHOLD` env var to override). This is the real
   enforcement: it holds new code to a strict bar without demanding a
   back-fill of the entire pre-existing UI. CI passes `--base
   ${{ github.event.pull_request.base.sha }}`; run it locally with `--base
   origin/main` (or any ref) after `npm run test:coverage` — use `origin/main`, not
   local `main`: every worktree in this repo branches straight off `origin/main` and
   never checks `main` itself out, so the local branch silently goes stale and
   `--base main` picks up other already-merged PRs as false "uncovered" diffs.
   The check also refuses an lcov file older than a changed source file, so a
   report left over from before your last edit cannot pass it: re-run
   `npm run test:coverage` when it says so.

Raising the global floor is welcome as coverage genuinely improves — bump the
numbers in `vitest.config.ts` to match, don't lower them to make a red build
green.

## Workflow: all changes go through a PR

`main` is branch-protected — direct pushes are blocked. Every change (code, docs, config) must go
through a pull request with the `verify` check passing. See `AGENTS.md` in the repo root for the
full PR workflow.

## Local parity tests

`src/domain/data/parseWorkbookCsv.parity.test.ts` compares the CSV importer with a spreadsheet export that is not in this repo. It runs only when `PARITY_TESTS=1` **and** `FINANCIAL_REVIEW_DIR` points at that export. CI sets neither, so it is skipped there.
