#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * One-time backfill for account_statements.paid_on (NULL rows only).
 *
 * Usage:
 *   npx tsx scripts/backfill-statement-paid-on.ts              # dry-run (default)
 *   npx tsx scripts/backfill-statement-paid-on.ts --apply     # dev DB
 *   CONFIRM_PROD_APPLY=1 npx tsx scripts/backfill-statement-paid-on.ts --apply --prod
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeBackfillUpdates } from '../src/domain/engine/statementPaymentDates.ts'
import { toAccount } from '../functions/_shared/rows.ts'
import type { AccountRow } from '../functions/_shared/rows.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const apply = process.argv.includes('--apply')
const prod = process.argv.includes('--prod')
const dbName = prod ? 'roy-expenses' : (process.env.DEV_D1_NAME ?? 'roy-expenses-dev')

interface StatementQueryRow {
  account_id: number
  year_month: string
  paid: number
  paid_on: string | null
  name: string
  kind: string
  settlement: string
  active: number
}

function d1Query(sql: string): StatementQueryRow[] {
  const escaped = sql.replace(/"/g, '\\"')
  const raw = execSync(
    `unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute ${dbName} --remote --json --command "${escaped}"`,
    { cwd: ROOT, encoding: 'utf8', shell: '/bin/bash' },
  )
  const parsed = JSON.parse(raw) as [{ results: StatementQueryRow[] }]
  return parsed[0]?.results ?? []
}

function accountFromRow(row: StatementQueryRow) {
  const accountRow: AccountRow = {
    id: row.account_id,
    name: row.name,
    kind: row.kind as AccountRow['kind'],
    settlement: row.settlement as AccountRow['settlement'],
    active: row.active,
  }
  return toAccount(accountRow)
}

const rows = d1Query(`
  SELECT ast.account_id, ast.year_month, ast.paid, ast.paid_on,
         a.name, a.kind, a.settlement, a.active
  FROM account_statements ast
  JOIN accounts a ON a.id = ast.account_id AND a.owner = ast.owner
  WHERE ast.paid = 1 AND ast.paid_on IS NULL AND a.settlement = 'deferred'
  ORDER BY ast.year_month, ast.account_id
`)

const updates = computeBackfillUpdates(
  rows.map((row) => ({
    accountId: row.account_id,
    yearMonth: row.year_month,
    paid: row.paid === 1,
    account: accountFromRow(row),
  })),
)

console.log(`DB: ${dbName}  mode: ${apply ? 'APPLY' : 'dry-run'}  rows: ${updates.length}`)
for (const u of updates) {
  const meta = rows.find((r) => r.account_id === u.accountId && r.year_month === u.yearMonth)
  console.log(`  ${meta?.name ?? u.accountId} ${u.yearMonth} → paid_on=${u.paidOn}`)
}

if (updates.length === 0) {
  console.log('Nothing to backfill.')
  process.exit(0)
}

const sqlLines = [
  '-- backfill-statement-paid-on generated',
  `-- db=${dbName} at=${new Date().toISOString()}`,
  ...updates.map(
    (u) =>
      `UPDATE account_statements SET paid_on = '${u.paidOn}' WHERE account_id = ${u.accountId} AND year_month = '${u.yearMonth}' AND paid = 1 AND paid_on IS NULL;`,
  ),
]

const sqlPath = join(ROOT, 'scripts/.backfill-statement-paid-on.sql')
writeFileSync(sqlPath, `${sqlLines.join('\n')}\n`)
console.log(`Wrote ${sqlPath}`)

if (!apply) {
  console.log('Dry-run only. Re-run with --apply to execute.')
  process.exit(0)
}

if (prod && process.env.CONFIRM_PROD_APPLY !== '1') {
  console.error('Prod apply blocked. Set CONFIRM_PROD_APPLY=1')
  process.exit(1)
}

execSync(`npx wrangler d1 execute ${dbName} --remote --file=${sqlPath}`, {
  cwd: ROOT,
  stdio: 'inherit',
})

const remainingRows = d1Query(`
  SELECT COUNT(*) AS n FROM account_statements ast
  JOIN accounts a ON a.id = ast.account_id AND a.owner = ast.owner
  WHERE ast.paid = 1 AND ast.paid_on IS NULL AND a.settlement = 'deferred'
`) as unknown as Array<{ n: number }>
const remaining = remainingRows[0]?.n

console.log(`Remaining NULL paid_on (deferred, paid): ${remaining ?? '?'}`)
