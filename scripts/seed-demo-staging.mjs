#!/usr/bin/env node
/**
 * Seed staging D1 with synthetic demo data for the shared demo Google account.
 * Idempotent for the demo owner only — other staging users are untouched.
 *
 *   npm run seed:demo-staging
 *
 * Env:
 *   DEMO_EMAIL — default expenses.tracker.demo@gmail.com
 *   DEV_D1_NAME — default roy-expenses-dev
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_EMAIL = (process.env.DEMO_EMAIL ?? 'expenses.tracker.demo@gmail.com')
  .trim()
  .toLowerCase()
const DEV_D1 = process.env.DEV_D1_NAME ?? 'roy-expenses-dev'
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'
const SQL_PATH = join(ROOT, '.tmp/demo-staging-seed.sql')

function sqlEscape(value) {
  return value.replace(/'/g, "''")
}

function runRemote(sql, db = DEV_D1) {
  execSync(`npx wrangler d1 execute ${db} --remote --command ${JSON.stringify(sql)}`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  })
}

function runRemoteFile(file, db = DEV_D1) {
  execSync(`npx wrangler d1 execute ${db} --remote --file=${file}`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  })
}

function ensureAccess() {
  const safe = sqlEscape(DEMO_EMAIL)
  runRemote(
    `INSERT OR IGNORE INTO allowed_users (email, status, granted_by) VALUES ('${safe}', 'active', 'demo-seed')`,
  )
  runRemote(
    `INSERT OR IGNORE INTO user_group_grants (email, group_id, granted_by) VALUES ('${safe}', 'expenses', 'demo-seed')`,
  )
  console.log(`allowlist + expenses grant: ${DEMO_EMAIL}`)
}

function generateSql() {
  mkdirSync(join(ROOT, '.tmp'), { recursive: true })
  execSync(`npx tsx scripts/gen-demo-seed-sql.ts ${SQL_PATH}`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, EXPENSE_OWNER: DEMO_EMAIL },
  })
}

function main() {
  console.log(`Seeding ${DEV_D1} for demo owner ${DEMO_EMAIL}`)
  ensureAccess()
  generateSql()
  runRemoteFile(SQL_PATH)
  const preview = readFileSync(SQL_PATH, 'utf8').split('\n').length
  console.log(`Demo staging seed complete (${preview} SQL lines).`)
  console.log(`Sign in at https://stg-expenses.crivolotti.com with Google: ${DEMO_EMAIL}`)
}

main()
