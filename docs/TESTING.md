# Testing — expense-tracker

Stack: **Vitest** + **React Testing Library** (UI) + in-memory D1 (Pages Functions).

## Commands

```bash
npm test              # all unit + integration tests
npm run test:watch    # if added locally via vitest --watch
npm run verify        # lint, typecheck, test, build
```

## Layers

| Layer | Location | What it proves |
| --- | --- | --- |
| Domain / service | `functions/_shared/**/*.test.ts`, `src/**/*.test.ts` | Business rules with mocked ports |
| **API integration** | `functions/api/access/access.integration.test.ts`, `functions/api/expenses/**/write.integration.test.ts` | Real auth middleware + route handlers + in-memory D1 |
| Hub nav | `src/hubNavItems.test.ts` | Group grants → visible cross-app links |
| UI | `src/**/*.test.tsx` | Component behaviour |

## Pages Function integration tests

Use `functions/_shared/testing/invokeApiRoute.ts` to run a handler through the real `/api/_middleware.ts` gate (Cloudflare Access header, allowlist, expenses group check).

Use `functions/_shared/testing/inMemoryAccessDb.ts` for stateful access tables (`allowed_users`, `access_requests`, `user_group_grants`). Expense purge is tracked via `purgedOwners` when the expenses group is revoked.

Example flow covered in `access.integration.test.ts`:

1. Owner reads all groups on `GET /api/access/grants`
2. Approve grants **expenses only** by default
3. Owner PATCH toggles finance/legacy; removing expenses purges D1 expense rows
4. Expense API returns 403 without the expenses group; access API still works

When adding a new protected route or group rule, extend that file first — it is the living spec for access behaviour.

## Local parity tests

`src/domain/data/parseWorkbookCsv.parity.test.ts` runs only when `FINANCIAL_REVIEW_DIR` (or gitignored `content/expenses_v3.csv`) is present. CI does not set that path, so parity is optional locally. Failures there do not block deploy.
