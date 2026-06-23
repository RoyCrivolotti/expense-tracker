#!/usr/bin/env node
/**
 * Copy prod D1 data into roy-expenses-dev for staging tests.
 * Dump stays in gitignored .tmp/ — never commit.
 */
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DUMP = join(ROOT, '.tmp/prod-dump.sql')
const PROD_DB = process.env.PROD_D1_NAME ?? 'roy-expenses'
const DEV_DB = process.env.DEV_D1_NAME ?? 'roy-expenses-dev'

mkdirSync(join(ROOT, '.tmp'), { recursive: true })

const skipExport = process.env.SEED_SKIP_EXPORT === '1'

if (!skipExport) {
  console.log(`Exporting ${PROD_DB} → ${DUMP}`)
  execSync(`npx wrangler d1 export ${PROD_DB} --remote --output=${DUMP}`, {
    cwd: ROOT,
    stdio: 'inherit',
  })
} else {
  console.log(`Skipping export — using existing ${DUMP}`)
}

console.log(`Importing into ${DEV_DB} (empty DB — do not run migrate:dev first)`)
execSync(`npx wrangler d1 execute ${DEV_DB} --remote --file=${DUMP}`, {
  cwd: ROOT,
  stdio: 'inherit',
})

console.log('Dev database seeded from prod copy.')
