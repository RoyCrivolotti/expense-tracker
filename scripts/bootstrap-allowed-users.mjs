#!/usr/bin/env node
/**
 * Seed allowed_users in D1 from ALLOWED_EMAILS env or config/allowed-emails.json.
 * Idempotent (INSERT OR IGNORE). Run after migration 0005 and before first deploy.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_NAME = 'roy-expenses'
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '800abdfb2ec1687266f66fd349c41d6a'

function loadEmails() {
  const fromEnv = process.env.ALLOWED_EMAILS?.trim()
  if (fromEnv) {
    if (fromEnv.startsWith('[')) {
      return [...new Set(JSON.parse(fromEnv).map((e) => String(e).trim().toLowerCase()))]
    }
    return [...new Set(fromEnv.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))]
  }
  const filePath = join(ROOT, 'config/allowed-emails.json')
  if (!existsSync(filePath)) {
    throw new Error('config/allowed-emails.json missing and ALLOWED_EMAILS unset')
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  return [...new Set(raw.map((e) => String(e).trim().toLowerCase()))]
}

function sqlEscape(value) {
  return value.replace(/'/g, "''")
}

function runRemote(sql) {
  execSync(`npx wrangler d1 execute ${DB_NAME} --remote --command ${JSON.stringify(sql)}`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
}

function main() {
  const emails = loadEmails()
  if (emails.length === 0) throw new Error('No emails to bootstrap')
  for (const email of emails) {
    const safe = sqlEscape(email)
    runRemote(
      `INSERT OR IGNORE INTO allowed_users (email, status, granted_by) VALUES ('${safe}', 'active', 'bootstrap')`,
    )
    console.log(`allowed_users: ${email}`)
  }
}

main()
