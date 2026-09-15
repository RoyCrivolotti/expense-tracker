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
   `node scripts/check-diff-coverage.mjs --base origin/main` after `npm run verify`
   (use the branch this PR is actually stacked on instead of `origin/main` if it's
   stacked on another open PR, not yet merged). Use `origin/main`, not local `main`
   — every worktree here branches straight off `origin/main` and nothing ever checks
   `main` itself out, so it silently goes stale and `--base main` reports other
   already-merged PRs as false "uncovered" diffs (`git fetch` first if unsure).
   CI requires 90% of changed lines to be covered. Write tests before pushing if
   coverage is short — this is the single most common cause of a locally-green
   `verify` turning into a red PR, since the global coverage floor `verify` checks
   is a lenient floor calibrated to the untested legacy codebase, not a bar new
   code has to clear.
4. **Push and open a draft PR** (`gh pr create --draft`). Never create a
   ready-for-review PR directly.
5. **Wait for CI** — both `verify` and `verify-and-deploy` must pass. If `verify`
   fails, fix locally and push again. An open PR with a failing or not-yet-checked
   CI run is not finished work — don't stop until you've confirmed the actual run
   is green. `verify-and-deploy` also deploys a staging preview and posts its URL
   into the PR description automatically once it succeeds — no manual step needed,
   don't hand-add a second one.
6. **Mark ready and merge** — `gh pr ready <n> && gh pr merge <n> --delete-branch`.
7. **Return to main** — `git checkout main && git pull` to pick up the merged commit
   before starting the next piece of work. Don't stack branches off a stale `main`.

## Verify

`npm run verify` is the baseline local gate. It runs, in order:

- Symlink checks, migration doc checks, PII scan
- ESLint
- TypeScript type checking
- Vitest with coverage (global thresholds enforced)
- Production build + bundle budget check

If it fails, fix before pushing — but passing it locally is necessary, not sufficient: CI separately
enforces diff coverage (see below) and, for UI-facing PRs, a screenshot check (see CLAUDE.md's Pull
request conventions). Neither runs as part of `npm run verify`.

## Coverage

Two checks, both enforced in CI on every PR:

- **Global floor** — overall coverage can't drop below the thresholds in
  `vitest.config.ts`. These reflect the current baseline, not an aspiration.
- **Diff coverage** — 90% of lines changed in the PR must be covered. This is the
  real enforcement mechanism. See `docs/TESTING.md` for details.

## Code style

- No narrating comments ("// Import the module"). A comment explains why the code is the
  way it is — not how it came to be. Incident history, PR rationale and "this used to be
  X" belong in git and the PR, not in the source. The test: does it stop the next reader
  breaking something?
- Follow existing patterns — check nearby files before inventing new abstractions.
- Prefer editing existing files over creating new ones.
- See `docs/ARCHITECTURE.md` for the layering rules (ports-and-adapters / hexagonal).

## Privacy

This repo has **public GitHub source**. Never commit real PII (personal emails,
financial figures, account IDs) in migrations, seed scripts, test fixtures, or
any tracked file. Use placeholders like `owner@example.com` with a comment to
substitute the real value at apply time. See `migrations/0003_multi_user.sql`
and `migrations/0011_user_preferences.sql` for the established pattern.
