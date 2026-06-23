#!/usr/bin/env node
/** Apply all migrations to roy-expenses-dev (remote). */
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB = process.env.DEV_D1_NAME ?? 'roy-expenses-dev'

const files = readdirSync(join(ROOT, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  console.log(`Applying ${file}…`)
  execSync(`npx wrangler d1 execute ${DB} --remote --file=migrations/${file}`, {
    cwd: ROOT,
    stdio: 'inherit',
  })
}
console.log(`Done — ${files.length} migration(s) on ${DB}`)
