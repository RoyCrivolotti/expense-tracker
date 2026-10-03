# Testing — expense-tracker

Stack: **Vitest** + **React Testing Library** (hooks) + in-memory D1 (Pages Functions).

## Commands

```bash
npm test              # all unit + integration tests
npm run test:coverage # same, plus a coverage report + global threshold check
npm run coverage:diff -- --base <sha>  # % of THIS diff's changed lines that are covered
npm run verify         # symlinks, migration docs, PII check, lint, typecheck, test:coverage, build, bundle budget
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
| Real browser (manual) | `scripts/verify-goals-*.mjs` | The layout jsdom cannot do (see below) |

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

## Real-browser checks (manual)

jsdom lays nothing out, so the unit tests for the Goals phone navigation and the section tabs write down every position they depend on. Four Playwright scripts measure the real thing in headless Chromium, on the `DOCS_CAPTURE=1` demo instance (seeded demo data, nothing real). Each starts its own dev server and stops it again. They are run by hand, need Chromium (`npx playwright install chromium`) and take a minute or a few, so none is part of `npm run verify` or CI.

| Command | What it checks |
| --- | --- |
| `npm run verify:goals-tabs` | The secondary chart picker on Goals' Chart view does not overlap at 390px. Serves on port 5173. |
| `npm run verify:goals-nav` | The Goals phone navigation at 375x812 and 320x568, plus landscape and large text: the view row sticks under the header, the hero chart is above the bottom bar on first load, each Scenarios chip lands its section under the pinned stack, the marked chip follows the scroll and a tapped chip stays marked until the viewer scrolls, each view comes back where it was left (also after a link), the four labels are shown whole, Scenarios is not pinned on a short screen, and no control that Tab or Shift+Tab reaches is covered by the header, the row, the stack or the bottom bar. |
| `npm run verify:goals-desktop` | The wide Goals Plan page from 1024px to 1920px, and with `ENGINES=chromium,webkit` in Safari's engine too: nothing in it scrolls on its own, it does not scroll sideways, the chart is wider than it was beside the side panel, the five levers and the result are on one row from 1250px and the bar is on screen on first load (held to the bottom edge from 1200px), it sticks under the header with 3px of air once the page has scrolled past it and nothing is drawn over it, hovering the chart shows the values for a year, the scenario menu opens inside the window with focus in it and Escape gives focus back to its button, the inputs panel folds open in columns and back to the page's length, typing over a lever marks the scenario as edited and Discard undoes it, a slider moves the net worth, and no control that Tab reaches is under the bar or the header (columns are read one after the other). It also checks 899px has the phone layout and 900px the wide page, the light theme and 150% text, that the chart leaves vertical swipes to the page on a touch screen, and that Progress and Assumptions keep their narrower page. |
| `npm run verify:section-tabs` | The Analytics and Settings section tabs at 375x812 and 320x568: the bar sticks under the header at 44px (36px on a desktop with a mouse) with a fade beneath it, a section tapped from down the page lands its content flush under the bar, comes back where it was left, and the four labels ("Preferences" included) are shown whole with no sideways scroll; and no control that Tab or Shift+Tab reaches is covered by the header, a section bar, the Transactions bar or a day heading, or the bottom bar, on the dashboard, Transactions, Analytics and Settings at 375x812 and 1100x800. |

`verify:goals-desktop` is run the same way (`CAPTURE_PORT=5490 npm run verify:goals-desktop`, a few minutes, `ENGINES=chromium,webkit` for both engines) after changing `src/ui/tabs/goals/desktop/`, the scroll padding the levers bar sets, or the Goals page width in the app shell.

`verify:goals-nav` prints one line per measurement and exits 1 with what it measured for any that fail. It serves on `CAPTURE_PORT` (5173 unless set, as `npm run capture:screenshots` does) and refuses to run if something already answers there, since it would be measuring someone else's code: `CAPTURE_PORT=5490 npm run verify:goals-nav`. Run it after changing `src/ui/tabs/goals/`, `SegmentedControl` or the app shell's header or bottom bar, since a unit test cannot see most of what those break. `verify:section-tabs` is run the same way (`CAPTURE_PORT=5490 npm run verify:section-tabs`, a few minutes) after changing `SectionTabs`, the scroll padding in `theme.css`, or what sticks under the header in Transactions.

## Coverage gate

Two separate checks, both run in CI (`.github/workflows/verify.yml`) on every PR:

1. **Global floor** — `vitest.config.ts`'s `coverage.thresholds` (statements 72 /
   branches 65 / functions 68 / lines 74, measured with `coverage.include`
   covering every `src/**`, `functions/**` and `workers/**` file, tested or not — an
   untested file counts as 0%, it doesn't just vanish from the denominator. The
   vitest harness under `src/test/` is excluded, being the thing that runs the
   tests rather than anything that ships).
   These are set about two points under the measured figure, so they catch a real
   drop without tripping on run-to-run wobble. **Re-measure and raise them when
   coverage rises**; they sat at 43/36/36/45 while the real numbers reached the
   mid-seventies, which is a floor low enough that coverage could have halved
   without failing. This check only catches the *overall* number regressing; it
   fails `npm run verify` locally too, since `verify` runs `test:coverage`.
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

Raising the global floor is welcome as coverage genuinely improves — bump the
numbers in `vitest.config.ts` to match, don't lower them to make a red build
green.

## Workflow: all changes go through a PR

`main` is branch-protected — direct pushes are blocked. Every change (code, docs, config) must go
through a pull request with the `verify` check passing. See `AGENTS.md` in the repo root for the
full PR workflow.

## Local parity tests

`src/domain/data/parseWorkbookCsv.parity.test.ts` runs only when `PARITY_TESTS=1` **and** `FINANCIAL_REVIEW_DIR` points at the private workbook export. CI sets neither, so parity is optional and local-only.
