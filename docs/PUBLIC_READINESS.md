# Public repository readiness

The **live app** at expenses.crivolotti.com stays private (Cloudflare Access). This
doc covers whether the **source repo** can be made public.

## Verdict: not ready without cleanup

Architecture is sound enough to share as a template, but the git tree and history
currently contain PII and personal financial fixtures.

## Blockers before `gh repo edit --visibility public`

| Item | Location | Action |
| --- | --- | --- |
| Real email allowlist | `config/allowed-emails.json` | Gitignored; use `allowed-emails.example.json` + local file or `ALLOWED_EMAILS` secret in CI |
| Emails in migration | `migrations/0003_multi_user.sql` | Redact to placeholder in a new migration doc; **git history still leaks** unless rewritten |
| Seed script owner | `scripts/gen-seed-sql.ts` | Use `EXPENSE_OWNER` env (no hardcoded email) |
| Personal finance in tests | `engine.test.ts`, parity test | Replace workbook-derived amounts with generic fixtures |
| Cloudflare IDs | workflow + sync script | Move to secrets/env only |
| Finance CSV | `content/` | Already gitignored |

## Safe to publish as-is

- Application code and domain layer (no holdings/transactions in source)
- Public hostnames in docs (not secrets)
- Test emails like `roy@example.com` in auth tests

## Recommended even if staying private

- FK ownership checks on API writes (`accountId` / `categoryId` scoped to owner)
- API integration tests for auth middleware and owner scoping
