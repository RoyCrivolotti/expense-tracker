# Public repository readiness

The **live app** at expenses.crivolotti.com stays private (Cloudflare Access). This
doc covers whether the **source repo** can be made public.

## Verdict: code-ready; history rewrite still required

Application code, fixtures, and migrations in **HEAD** use placeholders. Git **history**
may still contain earlier commits with PII until you run [HISTORY_REWRITE.md](./HISTORY_REWRITE.md).

## Checklist before `gh repo edit --visibility public`

| Item | Status |
| --- | --- |
| Real email allowlist | Gitignored; `allowed-emails.example.json` + `ALLOWED_EMAILS` secret |
| Migration backfill email | Placeholder `owner@example.com` in `0003_multi_user.sql` |
| Seed script owner | `EXPENSE_OWNER` env required |
| Personal finance in tests | Parity test skipped without local CSV |
| Cloudflare account ID | Env var in CI; not a secret but scoped to your account |
| Finance CSV | Gitignored under `content/` |
| FK ownership on writes | Implemented + tested |
| API write scoping tests | `functions/_shared/dbWrite.test.ts` |
| Git history PII | Run history rewrite (see below) |

## Safe to publish as-is (HEAD)

- Application code and domain layer
- Test emails like `roy@example.com` in auth tests
- Public hostnames in docs

## After going public

Keep the repo private on GitHub if you prefer; architecture is documented either way.
