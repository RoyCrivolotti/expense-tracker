# expense-tracker — Claude context

## Stack

- **Frontend**: Vite 8 + React 19 SPA (single `package.json`, no monorepo)
- **Backend**: Cloudflare Pages Functions (`functions/` directory, no ORM)
- **Database**: Cloudflare D1 (SQLite). Migrations are plain `.sql` files in `migrations/`
- **Auth**: Cloudflare Access + Google OAuth. The header `Cf-Access-Authenticated-User-Email` is injected by Cloudflare — the app never handles passwords or sessions
- **Storage**: Cloudflare R2 for daily backups
- **No** Supabase, Prisma, Drizzle, Stripe, AWS, or external DB

## Node version

Requires **Node ≥ 22.12.0**. CI runs Node 22 in all three workflows, and `.nvmrc` pins
**22.23.2** so `nvm use` picks it up automatically in any worktree.

```bash
nvm install   # first time in a worktree; reads .nvmrc
nvm use       # switch in an existing terminal
```

Do not assume the shell is already on the right version. This drifted once — the nvm default was
`24` while this file claimed it was pinned to 22.23.2, and v22.23.2 was not installed at all. Node 24
is the prime suspect for the D1 `--file` import failures recorded in `docs/DEPLOYMENT.md`: queries
worked, imports died with a bare `TypeError: fetch failed`, and the newest wrangler behaved
identically.

## npm cache

`~/.npm` is root-owned (legacy `sudo npm` issue). All sessions redirect npm to `~/.npm-fresh` via `NPM_CONFIG_CACHE` in `~/.zshrc`. Do **not** run `sudo npm` or `sudo npx`. To permanently fix the root-owned cache (requires password):

```bash
sudo chown -R $(whoami) ~/.npm
```

## Local dev

### Run the full stack (single command)

```bash
npm run dev:local
```

This starts Vite (port 5173) as a subprocess and proxies it through wrangler (port 8788) so Pages Functions (`/api/*`) are wired up. Open **http://localhost:8788**.

Reads the dev D1 database ID from `config/dev.json` automatically.

> **Auth caveat**: Cloudflare Access does not run locally. The `Cf-Access-Authenticated-User-Email` header will be absent, so all `/api/*` routes return 401. For UI-only work, `npm run dev` (Vite on port 5173 only) is sufficient.

### UI only (no API)

```bash
npm run dev
```

### Kill zombie wrangler/vite processes if ports are stuck

```bash
lsof -ti :8788 :5173 | xargs kill -9 2>/dev/null || true
pkill -f "wrangler pages dev"; pkill -f vite
```

## Worktrees

Every session works from its own worktree, never the shared main checkout. `Edit`/`Write` calls
against the original checkout are hard-blocked by a `PreToolUse` hook
(`.claude/hooks/enforce-worktree.sh`) — those tools take an absolute file path directly, so there's
nowhere to hide. The same hook also blocks a fixed list of git-mutating `Bash` calls (`commit`, `push`,
`add`, `mv`, `rm`, `rebase`, `merge`, `stash`, `clean`, `apply`, `branch -D`, `checkout -- <path>`, …,
including one right after a leading `cd <dir> &&` / `cd <dir>;`) whenever the target resolves to the
original checkout — detected by `.git` being a real directory there, versus the file every worktree
has. Read-only forms (`stash list`/`show`, `clean -n`, `apply --check`) and `git worktree add` itself
are unaffected.

The `Bash` half is **best-effort, not a sandbox**: it's pattern-matching on command text, so a
sufficiently indirect command (nested subshells, a variable holding the path, `pushd`) can still get
through, and non-git mutations (`rm`, `sed -i`, a shell redirect) aren't inspected at all. `Edit`/`Write`
staying unconditionally blocked is what actually carries the guarantee. Deliberate one-off override:
run with `CLAUDE_ALLOW_MAIN_CHECKOUT=1` in the environment. The hook only protects a worktree whose
branch has merged this commit — one created off an older `main` won't have it until it rebases or
merges.

It also doesn't touch the git stash stack, which is shared across *every* worktree of this repo (they
share one `.git`) — a `stash`/`stash pop` from any worktree can still collide with another session's
work. If you need to stash, tag it (`git stash push -u -m "<unique-tag>"`) and restore with
`stash apply <sha>` — never a bare `pop` — regardless of which worktree you're in.

```bash
git worktree add ../expense-tracker-<name> -b <branch> origin/main
npm ci --prefix ../expense-tracker-<name>     # required — node_modules is NOT shared between worktrees
cp .env ../expense-tracker-<name>/            # or: cp .env.example ../expense-tracker-<name>/.env
```

Then call the **`EnterWorktree`** tool with `path` set to that directory before touching any files.
This isn't optional: a bare `cd ../expense-tracker-<name>` doesn't reliably persist — the harness can
reset a `cd` that leaves the session's registered directory, so a later command silently runs back
where it started instead of erroring. `EnterWorktree` is what actually relocates the whole session
(Bash cwd, relative paths, and project settings together), and ending a session while still inside one
is what prompts to keep or remove it — the manual `git` commands alone never trigger that prompt.

That is enough for `npm run dev`, `npm test` and `npm run verify`. Specifically:

- **`npm run verify` needs none of the gitignored config files.** CI proves it — `verify.yml` is just
  checkout → `npm ci` → `npm run verify`, with no secret injection.
- **`content/` regenerates itself.** `prep:data` runs inside both `dev` and `build` and falls back to the
  committed `fixtures/demo-expenses.csv`.
- **The `functions/domain` and `functions/config` symlinks are tracked** (mode `120000`, relative), so
  `git worktree add` recreates them correctly.

Only if the worktree needs the full local stack (`npm run dev:local`):

```bash
cp config/dev.json ../expense-tracker-<name>/config/
```

`.claude/settings.local.json` is deliberately **not** copied — it is gitignored, machine-local, and has
previously accumulated API tokens from commands run with the secret inline. Let each worktree build its
own permission grants.

Cleanup is normally automatic: the keep-or-remove prompt above. If you need to leave a worktree
mid-session without ending the session, call `ExitWorktree` yourself (`action: "keep"` or `"remove"`),
only when asked to. It's a no-op outside a session that entered via `EnterWorktree` — it can't clean up
a worktree it never knew about, which is exactly how one was lost: `EnterWorktree` called with no
`name` produced the opaque `.claude/worktrees/nervous-easley-c5d4d6`, and it sat with a correct,
uncommitted ESLint fix for two days before being noticed and rescued in #84. Always pass `path` (as
above), or, if creating fresh with `EnterWorktree` directly, a `name` — an unnamed worktree is easy to
forget because nothing about it says what it's for.

## Credential files (all gitignored)

These must exist locally. None are committed. Copy from the `.example.json` counterpart and fill in the value.

| File | What goes in it | How to get the value |
|---|---|---|
| `.env` | Vite cross-link URLs | Copy `.env.example` as-is — values are public prod URLs |
| `config/dev.json` | Dev D1 database ID | `npx wrangler d1 list` → find your dev database |
| `config/access.json` | `ownerEmail` | Your Google account email |
| `config/allowed-emails.json` | Array of emails allowed to sign in | `["your-email@example.com"]` |
| `config/backup-alerts.json` | Backup alert recipients | Your email + the existing `fromAddress` |
| `config/goal-scenarios.seed.json` | Goal scenario seed data | Copy example as-is |

## Cloudflare tokens

Two tokens are used. Only the write token has deployment access.

| Token | Scope | Use |
|---|---|---|
| Write token | D1 Write, Pages Write, Workers Scripts Write, R2 Write, Access Write | Local dev + GitHub CI (`CLOUDFLARE_API_TOKEN` secret) |
| Read-only token | Read-only across all zones/account | Observer/monitoring only |

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must be set in your shell profile (e.g. `~/.zshrc`).

If the write token is ever rolled, update the `CLOUDFLARE_API_TOKEN` GitHub Actions secret immediately — CI deploys will fail until it's updated.

> **Deployment-specific values** (token names, database IDs, project names, account ID) live in
> `.claude/deploy-context.md` — a gitignored local file. See that file or create it from the
> template comment at the bottom of `.gitignore`.

## GitHub Actions secrets

| Secret | Value source | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | The write token above | Must be updated when token is rolled |
| `OWNER_EMAIL` | Owner's Google account — read from the GitHub secret or local `config/access.json` | Static — only changes if owner email changes |
| `ALLOWED_EMAILS` | Comma-separated allowed emails | Static |

## Database commands

```bash
# Apply any missing migrations to dev D1
npm run migrate:dev

# Seed allowed_users table from config/allowed-emails.json
npm run bootstrap:allowed-users

# Copy prod D1 snapshot into dev DB
npm run seed:dev

# Query dev DB directly
npx wrangler d1 execute <dev-db-name> --remote --command="SELECT ..."

# List all D1 databases
npx wrangler d1 list
```

Database names and IDs are in `config/dev.json` (dev) and the Cloudflare dashboard (prod). See `.claude/deploy-context.md` for the current values.

## Migrations

Sequentially numbered plain-SQL files in `migrations/` — **no migration tracking table**, so nothing
records what a database has already had. Run `ls migrations/` for the current set rather than trusting
a count written down here; this line has gone stale before.

`npm run migrate:dev` runs all of them in order. If the DB already has some applied, run only the
missing ones manually:

```bash
npx wrangler d1 execute <dev-db-name> --remote --file=migrations/0012_wealth_checkins.sql
```

> **If `--file` fails with a bare `TypeError: fetch failed`** — roughly 13s in, after "Uploading
> complete" — the upload endpoint rejected it, not the network. A `d1 execute --command` in the same
> shell still works, and that is how production took `0015`–`0019`. Node 24 is the prime suspect
> (see **Node version** above). `docs/DEPLOYMENT.md` carries the detail and the transcription rule:
> paste the statements verbatim, one file at a time, in order.

## Wrangler

Local dev uses the project-local wrangler (`node_modules/.bin/wrangler`). Always run wrangler commands from inside the project directory so `npx` picks up the local version rather than trying to download one.

Version pinned by `package-lock.json`: **4.131.1**, paired with `@cloudflare/workers-types@^5`.

Those two move **together**. Every wrangler >= 4.129 declares `peerOptional
@cloudflare/workers-types@^5`, so bumping wrangler alone leaves a mismatched peer, and bumping
`package.json` without regenerating the lockfile breaks `npm ci` on a clean checkout — which is what
happened on 2026-09-04 and left this section claiming the upgrade was blocked. It was not: raising
both in one `npm i -D` and committing the regenerated lockfile needed **no source changes at all**
(`tsc -b` clean, full `verify` green).

Note the upgrade pulls **miniflare 5.x alpha**, which is what `npm run dev:local` runs on. That is
what Cloudflare ships as wrangler 4.13x's own dependency, not a choice made here. It boots and serves
correctly — if local dev ever breaks in a way production does not, suspect this first.

## Deploy

```bash
npm run deploy        # production Pages project
npm run deploy:dev    # staging Pages project
```

CI deploys automatically on push to `main` via `.github/workflows/deploy.yml`.

Opening a PR also auto-deploys a staging preview via `.github/workflows/deploy-dev.yml` (or trigger
it manually for a branch with no PR yet: `gh workflow run deploy-dev.yml --ref <branch>`). That
workflow runs on GitHub's runners using the `CLOUDFLARE_API_TOKEN` **repository secret** — entirely
independent of whatever token is in your local `~/.zshrc`. If `npm run deploy:dev` fails locally with
"Invalid access token", the local token is stale (roll it — see Cloudflare tokens above); the
CI-triggered preview still works off the separately-maintained GitHub secret regardless. Each branch
gets its own stable alias URL, `https://<sanitized-branch>.roy-expenses-stg.pages.dev` (see the
truncation rule in `.claude/deploy-context.md`) — find it in the workflow run's "Deploy preview" step
output if you don't already know it.

**Both PR workflows run on every PR, whatever its base.** They used to filter on `branches: [main]`,
which matches the *base* branch — so a stacked PR (B based on A) got no CI at all until A merged, and
retargeting B to `main` afterwards did not start it either, because a base change is an `edited`
event that the default trigger list ignores. That cost a close/reopen on every PR in the flags stack.
`verify.yml` now also listens for `edited`, so retargeting *and* pasting a screenshot into the
description both re-run the checks.

## Verify (runs in CI and locally before deploy)

```bash
npm run verify
```

Runs: symlink check → migration doc check → PII check → lint → typecheck → test coverage → build → bundle budget check.

## Safe areas on a phone

`index.html` sets `viewport-fit=cover`, so the page extends **under** the status bar and the home
indicator. The app shell pays for that with `env(safe-area-inset-*)` padding, which is why ordinary
scrolling content never collides with the clock.

Anything positioned or sized against the **viewport** sits outside that padding and has to subtract
the insets itself:

- `position: fixed` surfaces — overlays, sheets, toasts, popovers.
- Anything sized in `dvh` / `dvw`, which **include** the inset regions. `max-height: 85dvh` on a
  bottom sheet reaches into the status bar on a tall phone.
- Anything placed by script from `getBoundingClientRect` coordinates.

Two traps that have each cost a round trip:

- **`env()` read back from a custom property is unreliable.** `getPropertyValue('--x')` returns a
  token stream, and WebKit does not always resolve `env()` there. Measure a hidden probe element
  whose *height* is the inset instead — a used value is always a number. `usePopoverPosition` does
  this.
- **`visualViewport.height` is not a position.** It describes a smaller window sitting at
  `offsetTop` inside the layout viewport, while `getBoundingClientRect` reports layout coordinates.
  Mixing them places things against a band that is not where the code thinks it is. The visible band
  in client coordinates is `offsetTop .. offsetTop + height`.

None of this goes away inside a native wrapper: a full-screen `WKWebView` reports the same insets and
needs the same CSS. A wrapper can avoid it by constraining the web view to the safe-area layout
guide, but that gives up edge-to-edge rendering, and the installed-PWA path needs the CSS regardless.

## Pull request conventions

PRs that change anything under `src/ui/` or any `.module.css` file must include screenshots showing the affected feature before and after, embedded in the PR description body. **CI enforces this** (`npm run check:pr-screenshots`, wired into `verify.yml`) — it fails the PR if a UI-facing file changed but the description has no markdown image link. For responsive changes, include a mobile (375px) capture alongside the desktop one.

GitHub has no API for uploading an image into a PR body directly (the normal drag-and-drop path needs an authenticated browser session `gh`/the REST API don't have). The convention that works without one:

1. Capture the screenshot(s) to a file.
2. Commit them on the PR branch under `docs/pr-screenshots/<pr-number-or-slug>/`, e.g. `docs/pr-screenshots/55-date-budget-stack/before.png`.
3. Reference them in the PR body with `![alt text](https://raw.githubusercontent.com/RoyCrivolotti/expense-tracker/<branch>/docs/pr-screenshots/<slug>/before.png)` — this renders inline immediately, no upload step, and the CI check accepts any markdown image link.

These stay in the repo permanently once merged (small PNGs — a personal project, and a visual history of UI changes is worth the few hundred KB). Crop to the relevant area rather than capturing full-page where a smaller image tells the same story.

If a screenshot can't show something meaningful (a change with no rendered difference in the states you can reach, or something environment-specific — see the note on native form controls below), say so explicitly in the PR body rather than omitting evidence silently; that satisfies the spirit of the rule even though the CI check itself just looks for *an* image link, not that it's the right one.

**Headless browsers do not reproduce native form-control rendering** (`<input type="date">`, `type="month"`, etc.) — Chromium and Playwright's WebKit build both render these as compact numeric text on desktop, while real iOS Safari renders locale-formatted long-form text plus a picker glyph. A screenshot showing a fix for one of these controls at the right viewport width is necessary evidence but is not proof it works on a real device — say so in the PR if that's the situation, and verify on-device or via the PR's own staging preview before treating it as confirmed.
