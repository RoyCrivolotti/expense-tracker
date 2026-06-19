#!/usr/bin/env node
/**
 * Deploy the expense-backup-cron Worker (D1 → R2 daily snapshot via cron).
 * Requires wrangler OAuth locally or CLOUDFLARE_API_TOKEN in CI.
 */
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

execSync('node scripts/ensure-function-symlinks.mjs', { cwd: ROOT, stdio: 'inherit' })
execSync('npx wrangler deploy --config workers/backup-cron/wrangler.toml', {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID:
      process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a',
  },
})
console.log('expense-backup-cron: deployed (cron 0 4 * * * UTC, Workers free tier)')
