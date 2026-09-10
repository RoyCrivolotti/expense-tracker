# expense-tracker — Claude context

## Stack

- **Frontend**: Vite 8 + React 19 SPA (single `package.json`, no monorepo)
- **Backend**: Cloudflare Pages Functions (`functions/` directory, no ORM)
- **Database**: Cloudflare D1 (SQLite). Migrations are plain `.sql` files in `migrations/`
- **Auth**: Cloudflare Access + Google OAuth. The header `Cf-Access-Authenticated-User-Email` is injected by Cloudflare — the app never handles passwords or sessions
- **Storage**: Cloudflare R2 for daily backups
- **No** Supabase, Prisma, Drizzle, Stripe, AWS, or external DB

## Node version

Requires **Node ≥ 22.12.0**. The repo uses v22.23.2 via nvm.

```bash
nvm use v22.23.2   # switch in an existing terminal
```

The nvm default is pinned to v22.23.2 in `~/.nvm/alias/default`.

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

Default to a worktree per stream of work, so parallel sessions never fight over one checkout.

```bash
git worktree add ../expense-tracker-<name> -b <branch>
cd ../expense-tracker-<name>
npm ci                       # required — node_modules is NOT shared between worktrees
cp ../expense-tracker/.env . # or: cp .env.example .env (public URLs, no secrets)
```

That is enough for `npm run dev`, `npm test` and `npm run verify`. Specifically:

- **`npm run verify` needs none of the gitignored config files.** CI proves it — `verify.yml` is just
  checkout → `npm ci` → `npm run verify`, with no secret injection.
- **`content/` regenerates itself.** `prep:data` runs inside both `dev` and `build` and falls back to the
  committed `fixtures/demo-expenses.csv`.
- **The `functions/domain` and `functions/config` symlinks are tracked** (mode `120000`, relative), so
  `git worktree add` recreates them correctly.

Only if the worktree needs the full local stack (`npm run dev:local`):

```bash
cp ../expense-tracker/config/dev.json config/
```

`.claude/settings.local.json` is deliberately **not** copied — it is gitignored, machine-local, and has
previously accumulated API tokens from commands run with the secret inline. Let each worktree build its
own permission grants.

Clean up when the branch is done: `git worktree remove ../expense-tracker-<name>`.

## Credential files (all gitignored)

These must exist locally. None are committed. Copy from the `.example.json` counterpart and fill in the value.

| File | What goes in it | How to get the value |
|---|---|---|
| `.env` | Vite cross-link URLs | Copy `.env.example` as-is — values are public prod URLs |
| `config/dev.json` | Dev D1 database ID | `npx wrangler d1 list` → find `roy-expenses-dev` |
| `config/access.json` | `ownerEmail` | `roycrivolotti@gmail.com` |
| `config/allowed-emails.json` | Array of emails allowed to sign in | `["roycrivolotti@gmail.com"]` |
| `config/backup-alerts.json` | Backup alert recipients | `roycrivolotti@gmail.com` + the existing `fromAddress` |
| `config/goal-scenarios.seed.json` | Goal scenario seed data | Copy example as-is |

## Cloudflare tokens

Two tokens exist. Only `roy-site-agent` has write access.

| Token name | Scope | Use |
|---|---|---|
| `roy-site-agent` | D1 Write, Pages Write, Workers Scripts Write, R2 Write, Access Write | Local dev + GitHub CI (`CLOUDFLARE_API_TOKEN` secret) |
| `Cloudflare Agent Token - 2026-06-19` | Read-only across all zones/account | Observer/monitoring only |

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set in `~/.zshrc`.

If `roy-site-agent` is ever rolled, update the `CLOUDFLARE_API_TOKEN` GitHub Actions secret immediately — CI deploys will fail until it's updated.

## GitHub Actions secrets

| Secret | Value source | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `roy-site-agent` token | Must be updated when token is rolled |
| `OWNER_EMAIL` | Owner's Google account address — read the live value from the GitHub secret or local `config/access.json`, not from here | Static — only changes if owner email changes |
| `ALLOWED_EMAILS` | Comma-separated allowed emails | Static |
| `FINANCIAL_REVIEW_PAT` | Legacy — not referenced in any workflow | Can be ignored |

## Database commands

```bash
# Apply any missing migrations to dev D1
npm run migrate:dev

# Seed allowed_users table from config/allowed-emails.json
npm run bootstrap:allowed-users

# Copy prod D1 snapshot into dev DB
npm run seed:dev

# Query dev DB directly
npx wrangler d1 execute roy-expenses-dev --remote --command="SELECT ..."

# List all D1 databases
npx wrangler d1 list
```

The dev DB is `roy-expenses-dev` (ID: `7e58a8e1-a656-4e99-8cc6-273d692b608d`).
The prod DB is `roy-expenses` (ID: `3dcefc85-e172-4fd0-a623-f2f15120c9d9`).

## Migrations

14 migration files (`0001`–`0014`) in `migrations/`. They are plain SQL — no migration tracking table. `npm run migrate:dev` runs all of them in order; if the DB already has some applied, run only the missing ones manually:

```bash
npx wrangler d1 execute roy-expenses-dev --remote --file=migrations/0012_wealth_checkins.sql
```

## Wrangler

Local dev uses the project-local wrangler (`node_modules/.bin/wrangler`). Always run wrangler commands from inside the project directory so `npx` picks up the local version rather than trying to download one.

Version pinned by `package-lock.json`: **4.103.0**. `package.json` declares `^4.101.0`.

**A local upgrade to 4.129.0 is pending and has not landed.** It was installed locally on 2026-09-04 to
support compatibility dates ≥ 2026-06-24, but `package.json` was bumped without regenerating the lockfile,
so `npm ci` fails on a clean checkout. The blocker is real rather than cosmetic: every wrangler ≥ 4.129
declares `peerOptional @cloudflare/workers-types@^5`, while this project is on `@cloudflare/workers-types@^4`.

Landing it means bumping both together and re-running `npm run typecheck` against the v5 types — its own
PR, not a drive-by. Until then, a machine whose `node_modules` still has 4.129.0 installed is ahead of the
repo; `npm ci` will bring it back to 4.103.0.

## Deploy

```bash
npm run deploy        # production (expense-tracker Pages project)
npm run deploy:dev    # staging (roy-expenses-stg Pages project)
```

CI deploys automatically on push to `main` via `.github/workflows/deploy.yml`.

## Verify (runs in CI and locally before deploy)

```bash
npm run verify
```

Runs: symlink check → migration doc check → PII check → lint → typecheck → test coverage → build → bundle budget check.

## Pull request conventions

PRs that change anything under `src/ui/` or any `.module.css` file must include screenshots (or a short screen recording) showing the affected feature before and after. Attach them in the PR description body. For responsive changes, include a mobile (375px) capture alongside the desktop one.
