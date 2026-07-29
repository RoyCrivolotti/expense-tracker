# Agent Guide — expense-tracker

Rules for any AI agent (Cursor, Claude Code, Copilot, etc.) working in this repo.

## Branch protection

`main` is protected. Direct pushes are blocked, even for the repo owner.

All changes — code, docs, config — must go through a pull request with the
`verify` check passing before merge.

## PR workflow

1. **Branch** off `main` with a descriptive name (e.g. `fix/pie-legend-touch-blink`,
   `feat/wealth-checkins`).
2. **Implement** the change. Run `npm run verify` locally before pushing — it runs
   lint, typecheck, tests with coverage, and a production build.
3. **Diff coverage** — for code changes (`.ts`/`.tsx`), run
   `node scripts/check-diff-coverage.mjs --base main` after `npm run verify`.
   CI requires 90% of changed lines to be covered. Write tests before pushing if
   coverage is short.
4. **Push and open a draft PR** (`gh pr create --draft`). Never create a
   ready-for-review PR directly.
5. **Wait for CI** — both `verify` and `verify-and-deploy` must pass. If `verify`
   fails, fix locally and push again.
6. **Mark ready and merge** — `gh pr ready <n> && gh pr merge <n> --squash --delete-branch`.
   Squash merge is the default; the repo's history is linear.
7. **Return to main** — `git checkout main && git pull` to pick up the merged commit
   before starting the next piece of work. Don't stack branches off a stale `main`.

## Verify

`npm run verify` is the single gate. It runs, in order:

- Symlink checks, migration doc checks, PII scan
- ESLint
- TypeScript type checking
- Vitest with coverage (global thresholds enforced)
- Production build + bundle budget check

If verify passes locally, CI will pass. If it doesn't, fix before pushing.

## Coverage

Two checks, both enforced in CI on every PR:

- **Global floor** — overall coverage can't drop below the thresholds in
  `vitest.config.ts`. These reflect the current baseline, not an aspiration.
- **Diff coverage** — 90% of lines changed in the PR must be covered. This is the
  real enforcement mechanism. See `docs/TESTING.md` for details.

## Code style

- No narrating comments ("// Import the module"). Comments explain *why*, not *what*.
- Follow existing patterns — check nearby files before inventing new abstractions.
- Prefer editing existing files over creating new ones.
- See `docs/ARCHITECTURE.md` for the layering rules (ports-and-adapters / hexagonal).

## Privacy

This repo has **public GitHub source**. Never commit real PII (personal emails,
financial figures, account IDs) in migrations, seed scripts, test fixtures, or
any tracked file. Use placeholders like `owner@example.com` with a comment to
substitute the real value at apply time. See `migrations/0003_multi_user.sql`
and `migrations/0011_user_preferences.sql` for the established pattern.
