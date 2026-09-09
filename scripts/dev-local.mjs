#!/usr/bin/env node
/**
 * Full-stack local dev: wrangler pages dev proxying to Vite, with the dev D1
 * database wired up. Reads the database ID from config/dev.json so the command
 * stays in sync with whatever DB was created for this machine.
 *
 * Usage: npm run dev:local
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let devConfig
try {
  devConfig = JSON.parse(readFileSync(join(ROOT, 'config/dev.json'), 'utf8'))
} catch {
  console.error('config/dev.json not found. Run setup first.')
  process.exit(1)
}

const { d1DatabaseId, d1DatabaseName } = devConfig
console.log(`Starting dev stack with D1: ${d1DatabaseName} (${d1DatabaseId})`)

execSync(
  `npx wrangler pages dev --d1 DB=${d1DatabaseId} -- npm run dev`,
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env } }
)
