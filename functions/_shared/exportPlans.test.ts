/**
 * What a chunk costs is the rows SQLite visits, and D1 bills those as rows read whether or not they are
 * returned. Every table's statement, for its first chunk and a later one, goes through `EXPLAIN QUERY PLAN`
 * with and without table statistics and among several owners, and fails on a full scan of the table, on a
 * sort, and on a statement that reads another owner's rows through an index that is not the owner's.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { EXPORT_TABLES, type ExportTable } from '../domain/data/exportTables'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, planOf, queryDb, type QueryDb } from '../../src/testing/transactionQueryKit'
import { CHECKIN_ENTRIES_SQL, exportSql } from './exportSql'

const TABLES: Record<ExportTable, string> = {
  categories: 'categories',
  accounts: 'accounts',
  labels: 'labels',
  flags: 'flags',
  accountStatements: 'account_statements',
  cashActuals: 'cash_actuals',
  settings: 'settings',
  goalScenarios: 'goal_scenarios',
  installmentPlans: 'installment_plans',
  wealthAccounts: 'wealth_accounts',
  wealthCheckins: 'wealth_checkins',
  transactions: 'transactions',
  attachments: 'transaction_attachments',
}

const LATER: Partial<Record<ExportTable, string>> = {
  accountStatements: '3:2026-03',
  cashActuals: '2026-03',
}

const SORT = /USE TEMP B-TREE FOR ORDER BY/

/**
 * Neither table has an index on its owner, so the first chunk reads the whole table, as the dataset's own
 * read of it does. They hold a handful of rows per owner. A later chunk starts at a position in the primary
 * key and does not scan.
 */
const NO_OWNER_INDEX: ExportTable[] = ['categories', 'accounts']

describe.each([{ stats: false }, { stats: true }])('export query plans (table statistics: $stats)', ({ stats }) => {
  let kit: QueryDb

  beforeAll(() => {
    const others = Array.from({ length: 6 }, (_, i) => ({
      owner: `other${i}@example.com`,
      dataset: syntheticLedger({ months: 18, perMonth: 30, seed: 40 + i }),
    }))
    kit = queryDb(syntheticLedger({ months: 18, perMonth: 30, seed: 9 }), others)
    if (stats) kit.sqlite.exec('ANALYZE')
  })

  const fullScan = (table: string) => new RegExp(`^SCAN (${table}|t|c)\\b`)

  it.each(EXPORT_TABLES)('%s: a search, never a scan, and no sort', (table) => {
    for (const after of [undefined, LATER[table] ?? '1000']) {
      if (table === 'settings' && after !== undefined) continue
      const { sql, params } = exportSql(table, OWNER, after, 100)
      const plan = planOf(kit.sqlite, { sql, params })
      const text = plan.join('\n')
      const scans = plan.filter((line) => fullScan(TABLES[table]).test(line))

      expect(scans, text).toEqual(NO_OWNER_INDEX.includes(table) && after === undefined ? [`SCAN ${TABLES[table]}`] : [])
      expect(text, text).not.toMatch(SORT)
    }
  })

  it('transactions are read through the owner’s index, from the position, in order', () => {
    const { sql, params } = exportSql('transactions', OWNER, '1000', 100)

    expect(planOf(kit.sqlite, { sql, params }).join('\n')).toMatch(/SEARCH t USING INDEX idx_txn_owner \(owner=\? AND rowid>\?\)/)
  })

  it('the entries of a chunk’s check-ins are found by check-in, not by scanning the entries', () => {
    const plan = planOf(kit.sqlite, { sql: CHECKIN_ENTRIES_SQL, params: [OWNER, '[1,2,3]'] })

    expect(plan.filter((line) => /^SCAN (e|wealth_checkin_entries)\b/.test(line)), plan.join('\n')).toEqual([])
  })
})
