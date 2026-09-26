# expense-tracker — project context

Orientation for anyone working in this repo. [AGENTS.md](AGENTS.md) has the branch/PR
workflow; `docs/` has the detail behind each area.

## Stack

- **Frontend**: Vite 8 + React 19 SPA (single `package.json`, no monorepo)
- **Backend**: Cloudflare Pages Functions (`functions/`, no ORM)
- **Database**: Cloudflare D1 (SQLite); migrations are plain `.sql` files in `migrations/`
- **Auth**: Cloudflare Access + Google OAuth. Cloudflare injects
  `Cf-Access-Authenticated-User-Email`; the app never handles passwords or sessions
- **Storage**: Cloudflare R2 for receipts and daily backups

No Supabase, Prisma, Drizzle, Stripe or AWS.

## Requirements

Node ≥ 22.12.0. `.nvmrc` pins 22.23.2; CI runs Node 22.

```bash
nvm use && npm ci
```

Node 24 is a known-bad version for D1 `--file` imports — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Local dev

```bash
npm run dev         # UI only, port 5173
npm run dev:local   # full stack: Vite proxied through wrangler on port 8788
```

`npm run dev` reads `fixtures/demo-expenses.csv` directly — no setup, and no path to real
data. `dev:local` wires up `/api/*` and reads the dev D1 id from `config/dev.json`.

Cloudflare Access does not run locally, so `dev:local` returns 401 from every `/api/*`
route. Use `npm run dev` for UI work.

If ports are stuck:

```bash
lsof -ti :8788 :5173 | xargs kill -9 2>/dev/null || true
```

## Configuration

Gitignored; copy each from its `.example.json` counterpart.

| File | Contents | Where the value comes from |
|---|---|---|
| `.env` | Vite cross-link URLs | `.env.example` as-is — public prod URLs |
| `config/dev.json` | Dev D1 database id | `npx wrangler d1 list` |
| `config/access.json` | `ownerEmail` | The owner's Google account |
| `config/allowed-emails.json` | Emails allowed to sign in | — |
| `config/backup-alerts.json` | Backup alert recipients | — |
| `config/goal-scenarios.seed.json` | Goal scenario seed data | Copy the example as-is |

`npm run verify` needs none of these; CI proves it (`verify.yml` is checkout → `npm ci` →
`npm run verify`, with no secrets injected).

**Cloudflare tokens.** Two: a write token (D1, Pages, Workers Scripts, R2, Access) used by
local dev and the `CLOUDFLARE_API_TOKEN` GitHub secret, and a read-only token for
monitoring. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` belong in your shell
profile. Rolling the write token means updating the GitHub secret too, or CI deploys fail.

**GitHub Actions secrets**: `CLOUDFLARE_API_TOKEN`, `OWNER_EMAIL`, `ALLOWED_EMAILS`.

Deployment-specific values (database ids, project names, account id) live in the
gitignored `.claude/deploy-context.md`.

## Worktrees

Work happens in a git worktree, never the shared main checkout. A `PreToolUse` hook
(`.claude/hooks/enforce-worktree.sh`) blocks writes and git mutations that target the
original checkout; `CLAUDE_ALLOW_MAIN_CHECKOUT=1` overrides it for a deliberate one-off.
It is pattern-matching on command text, not a sandbox.

```bash
git worktree add ../expense-tracker-<name> -b <branch> origin/main
npm ci --prefix ../expense-tracker-<name>     # node_modules is not shared
cp .env ../expense-tracker-<name>/
```

That is enough for `dev`, `test` and `verify`. Add `config/dev.json` only if you need
`dev:local`. Don't copy `.claude/settings.local.json` — it is machine-local and can
accumulate tokens.

**The git stash stack is shared across every worktree** (they share one `.git`). Prefer a
WIP commit. If you must stash, tag it (`git stash push -u -m "<tag>"`) and restore with
`stash apply <sha>`, never a bare `pop`.

## Database

```bash
npm run migrate:status           # what dev and prod are each missing; changes nothing
npm run migrate:dev              # apply pending migrations to dev D1 (prod's run on merge)
npm run bootstrap:allowed-users  # seed allowed_users from config
npm run seed:dev                 # copy a prod snapshot into dev
npx wrangler d1 list
```

Migrations are numbered `.sql` files applied in order. Re-running one is destructive, not
merely noisy — `0003` and `0012` contain unscoped `UPDATE`s and `DROP TABLE`s — so apply
only the files a database has not had. The Deploy workflow does that for dev and prod when a
PR merges, before the code deploys, so a migration must be one the release already running
can live with (no drops or renames of what it reads).
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers that and the `--file` import failure with its
`--command` fallback.

## Wrangler

Run wrangler from inside the project so `npx` picks up the local install. `wrangler` and
`@cloudflare/workers-types` must move together: wrangler ≥ 4.129 declares
`peerOptional @cloudflare/workers-types@^5`, so raise both in one `npm i -D` and commit the
regenerated lockfile, or `npm ci` breaks on a clean checkout.

`npm run dev:local` runs on the miniflare alpha that wrangler depends on. If local dev
breaks in a way production does not, suspect that first.

## Deploy

```bash
npm run deploy        # production
npm run deploy:dev    # staging
```

CI applies pending migrations and then deploys `main` automatically. Every PR gets a staging preview at
`https://<sanitized-branch>.roy-expenses-stg.pages.dev`, and `deploy-dev.yml` posts that
URL into the PR description itself — don't add a second one by hand.

To preview a branch that has no PR yet, run the workflow by hand:

```bash
gh workflow run deploy-dev.yml --ref <branch>
```

It deploys to the same per-branch URL but has no PR description to post into, which is
what the comment at the end of `deploy-dev.yml` is about.

Both PR workflows run on every PR regardless of base, so a stacked PR gets checks and a
preview without waiting for the one under it. Only `verify.yml` re-runs on `edited`, so
retargeting a stacked PR or adding the screenshot restarts the checks; `deploy-dev.yml`
deliberately stays out of that, since retitling a PR is no reason to redeploy it.

## Verify and CI gates

```bash
npm run verify
```

Symlink check → migration doc check → PII check → lint → typecheck → test coverage →
build → bundle budget.

**A green `verify` does not mean CI will be green.** Two required checks run only in CI:

- **Diff coverage** — 90% of the PR's changed `.ts`/`.tsx` lines. Much stricter than the
  global floor, which sits a couple of points under the whole repo's measured coverage
  and so moves barely at all when one PR adds untested code. New untested code passes
  `verify` and fails here. Run it first:
  ```bash
  npm run coverage:diff -- --base origin/main
  ```
  Use `origin/main`, not local `main` — nothing checks `main` out, so it goes stale and
  reports already-merged work as uncovered.
- **PR screenshots** — see below.

## Conventions

**Real data never reaches the repo.** The app has no code path to anything but
`fixtures/demo-expenses.csv`: `csvDataSource` imports it directly, and production uses the
D1 API. The private workbook export has exactly one reader, `scripts/gen-seed-sql.ts`,
which requires `FINANCIAL_REVIEW_DIR` and writes outside the repo. Never hardcode that
location, name the private repo, or default to it — `scripts/check-pii.mjs` fails the build
on all three. It scans text, so it says nothing about what an image contains; a screenshot
of the *deployed* app is not guarded by anything here.

Before adding a checker, ask whether the state it would detect is still representable.

**Safe areas.** `index.html` sets `viewport-fit=cover`, so the page renders under the
status bar and home indicator. The app shell pays for that with `env(safe-area-inset-*)`
padding; anything sized or positioned against the *viewport* sits outside that padding and
must subtract the insets itself — `position: fixed` surfaces, anything in `dvh`/`dvw`, and
anything placed from `getBoundingClientRect`. Two rules that are easy to get wrong:

- `env()` read back from a custom property is unreliable — `getPropertyValue` returns a
  token stream and WebKit does not always resolve it. Measure a hidden probe element's
  height instead (`usePopoverPosition` does this).
- `visualViewport.height` is a size, not a position. The visible band in client
  coordinates is `offsetTop .. offsetTop + height`; mixing it with layout coordinates
  places things against a band that isn't there.

A full-screen `WKWebView` reports the same insets, so none of this goes away in a native
wrapper.

**PR screenshots.** Any PR touching `src/ui/**` or a `.module.css` must embed before/after
images in its description; CI enforces it. Commit them under
`docs/pr-screenshots/<slug>/` and reference them by `raw.githubusercontent.com` URL —
GitHub has no API for uploading into a PR body. Pin that URL to a commit SHA, not the
branch name: merged branches are deleted automatically, and an image pinned to its branch
404s the moment the branch goes. Merges here are true merge commits, so a commit on the
branch stays reachable afterwards; rebasing replaces it, so re-pin after a rebase.
Include a 375px capture for responsive changes. Headless browsers do not reproduce native form controls (`<input type="date">`),
so a desktop capture of one is necessary but not sufficient — say so and verify on-device.
The check does not count an image stored anywhere else in this repo, such as the docs
gallery: it is not a picture of the change.

**Motion.** Anything that appears also leaves, over the same path backwards, and neither
takes long: about 220ms in and 170ms out for a sheet, less for smaller things (the tokens
are in `theme.css`, the exit times in `hooks/motion.ts`). An overlay that unmounts in the
same commit that closes it cannot animate out, so hold it with `<Presence show exitMs>`
(or `PresenceValue` when its props come from state that is null while closed) and read
`useExit()` to add the leaving class. The close then runs at once, from any route (Save,
Discard, a swipe), and only the element outlives it. Exit CSS reads `--exit-ms` from
`exitVars()` rather than a duration of its own, so the animation and the mount cannot
disagree. A leaving overlay is `inert`, so a second tap or Enter cannot act twice. Use
opacity and translate for popovers, never scale: `usePopoverPosition` measures the box.
Tests run with motion off (`setMotionDisabledForTests`), and a test about motion switches
it back on.

**Comments** explain why this code is the way it is, not how it came to be. History belongs
in git. A comment earns its place when it stops the next reader breaking something.

## Further reading

| Doc | |
|---|---|
| [AGENTS.md](AGENTS.md) | Branch and PR workflow |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering rules |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy, migrations, access control |
| [docs/OPS.md](docs/OPS.md) | Staging, backups, runbooks |
| [docs/TESTING.md](docs/TESTING.md) | Coverage gates |
| [docs/GOALS-MODEL.md](docs/GOALS-MODEL.md) | Projection engine |
