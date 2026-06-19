#!/usr/bin/env node
/**
 * Deploy the expense-backup-cron Worker (D1 → R2 daily snapshot via cron).
 * Requires wrangler OAuth locally or CLOUDFLARE_API_TOKEN with Workers Scripts Edit in CI.
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const WORKERS_SCOPE_HINT =
  'Add Account → Workers Scripts → Edit (and Workers R2 Storage → Edit) to the GitHub CLOUDFLARE_API_TOKEN, or deploy locally: unset CLOUDFLARE_API_TOKEN && npm run deploy:backup-cron'

function isAuthScopeError(output) {
  return /Authentication error|code: 10000|incorrect permissions on your API token/i.test(output)
}

function run(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
    },
  })
}

const prep = run('node', ['scripts/ensure-function-symlinks.mjs'])
if (prep.status !== 0) {
  process.stderr.write(prep.stderr ?? prep.stdout ?? '')
  process.exit(prep.status ?? 1)
}

const deploy = run('npx', ['wrangler', 'deploy', '--config', 'workers/backup-cron/wrangler.toml'])
const output = `${deploy.stdout ?? ''}${deploy.stderr ?? ''}`

if (deploy.status === 0) {
  process.stdout.write(output)
  console.log('expense-backup-cron: deployed (cron 0 4 * * * UTC, Workers free tier)')
  process.exit(0)
}

process.stderr.write(output)

if (process.env.GITHUB_ACTIONS && isAuthScopeError(output)) {
  console.warn('')
  console.warn('expense-backup-cron: skipped in CI — CLOUDFLARE_API_TOKEN lacks Workers deploy scope.')
  console.warn(WORKERS_SCOPE_HINT)
  process.exit(0)
}

process.exit(deploy.status ?? 1)
