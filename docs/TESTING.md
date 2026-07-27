# Testing — expense-tracker

Stack: **Vitest** + **React Testing Library** (hooks) + in-memory D1 (Pages Functions).

## Commands

```bash
npm test              # all unit + integration tests
npm run test:coverage # same, plus a coverage report + global threshold check
npm run coverage:diff -- --base <sha>  # % of THIS diff's changed lines that are covered
npm run verify         # symlinks, lint, typecheck, test:coverage, build
PARITY_TESTS=1 npm test   # optional workbook parity (private CSV)
```

## Layers

| Layer | Location | What it proves |
| --- | --- | --- |
| Domain / engine | `src/domain/**/*.test.ts` | Pure compute rules |
| Service / shared | `functions/_shared/**/*.test.ts` | Backup, auth, DB helpers |
| **API integration** | `functions/api/access/access.integration.test.ts`, `functions/api/expenses/expenses.integration.test.ts`, `functions/api/expenses/transactions/write.integration.test.ts` | Middleware + handlers + in-memory repo or D1 |
| Hub nav | `src/hubNavItems.test.ts` | Group grants → visible cross-app links |
| UI hooks | `src/ui/**/*.test.tsx` | Hook behaviour (RTL) |

## Pages Function integration tests

Use `functions/_shared/testing/invokeApiRoute.ts` for access routes (real middleware + in-memory D1).

Use `functions/_shared/testing/invokeExpenseApiRoute.ts` for expense routes (real middleware + injected in-memory `ExpenseRepository`).

Use `functions/_shared/invokePagesRoute.ts` for transaction write validation against mocked D1 ownership checks.

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

## Coverage gate

Two separate checks, both run in CI (`.github/workflows/verify.yml`) on every PR:

1. **Global floor** — `vitest.config.ts`'s `coverage.thresholds` (statements 43 /
   branches 36 / functions 36 / lines 45, measured with `coverage.include`
   covering every `src/**` and `functions/**` file, tested or not — an
   untested file counts as 0%, it doesn't just vanish from the denominator).
   These numbers are the actual current baseline, not an aspiration: most of
   the UI (charts, settings tabs, dashboard) predates any coverage
   requirement and isn't covered. This check only catches the *overall*
   number regressing; it fails `npm run verify` locally too, since `verify`
   runs `test:coverage`.
2. **Diff coverage** — `scripts/check-diff-coverage.mjs` parses `coverage/lcov.info`
   plus `git diff --unified=0 <base>...HEAD` to compute what % of *this PR's
   added/changed* `.ts`/`.tsx` lines are covered, and fails below 90%
   (`DIFF_COVERAGE_THRESHOLD` env var to override). This is the real
   enforcement: it holds new code to a strict bar without demanding a
   back-fill of the entire pre-existing UI. CI passes `--base
   ${{ github.event.pull_request.base.sha }}`; run it locally with `--base
   main` (or any ref) after `npm run test:coverage`.

Raising the global floor is welcome as coverage genuinely improves — bump the
numbers in `vitest.config.ts` to match, don't lower them to make a red build
green.

## Workflow: non-trivial changes go through a PR

Diff coverage only runs on `pull_request` (see `.github/workflows/verify.yml`) — a direct push to
`main` skips it. Running `coverage:diff` locally afterward is a manual best-effort check, not the
same guarantee CI gives a PR. So: branch, push, open a PR, let `verify` + diff coverage go green,
then merge. Docs-only changes (changelog, README) with no `.ts`/`.tsx` diff are the exception and
can still go straight to `main`.

## Local parity tests

`src/domain/data/parseWorkbookCsv.parity.test.ts` runs only when `PARITY_TESTS=1` **and** `FINANCIAL_REVIEW_DIR` (or `content/expenses_v3.csv`) is present. CI does not set either, so parity is optional locally.
