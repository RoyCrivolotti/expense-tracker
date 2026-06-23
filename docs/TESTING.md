# Testing — expense-tracker

Stack: **Vitest** + **React Testing Library** (hooks) + in-memory D1 (Pages Functions).

## Commands

```bash
npm test              # all unit + integration tests
npm run verify        # symlinks, lint, typecheck, test, build
PARITY_TESTS=1 npm test   # optional workbook parity (private CSV)
```

## Layers

| Layer | Location | What it proves |
| --- | --- | --- |
| Domain / engine | `src/domain/**/*.test.ts` | Pure compute rules |
| Service / shared | `functions/_shared/**/*.test.ts` | Backup, auth, DB helpers |
| **API integration** | `functions/api/access/access.integration.test.ts`, `functions/api/expenses/expenses.integration.test.ts`, `write.integration.test.ts` | Middleware + handlers + in-memory repo or D1 |
| Hub nav | `src/hubNavItems.test.ts` | Group grants → visible cross-app links |
| UI hooks | `src/ui/**/*.test.tsx` | Hook behaviour (RTL) |

## Pages Function integration tests

Use `functions/_shared/testing/invokeApiRoute.ts` for access routes (real middleware + in-memory D1).

Use `functions/_shared/testing/invokeExpenseRoute.ts` for expense routes (in-memory `ExpenseRepository`).

Example flows in `access.integration.test.ts`:

1. Owner reads all groups on `GET /api/access/grants`
2. Approve grants **expenses only** by default
3. Owner PATCH toggles finance/legacy/oncall; removing expenses purges D1 expense rows
4. Expense API returns 403 without the expenses group; access API still works

When adding a new protected route or group rule, extend that file first.

## Local parity tests

`src/domain/data/parseWorkbookCsv.parity.test.ts` runs only when `PARITY_TESTS=1` **and** `FINANCIAL_REVIEW_DIR` (or `content/expenses_v3.csv`) is present. CI does not set either, so parity is optional locally.
