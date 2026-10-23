// @vitest-environment node
/**
 * What the ledger parts cost is the rows SQLite visits, and D1 bills those as rows read. Each statement
 * the repository runs for the three parts goes through `EXPLAIN QUERY PLAN` here (the statements are the
 * ones the adapter actually ran, not copies), with and without table statistics and among several
 * owners, because the planner chooses differently once it has them. The build fails on a full scan of
 * `transactions`, on a plan that reads all the owner's rows where an index should narrow them, and on a
 * pinned-row read that stops going through `idx_txn_pinned`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, planOf, queryDb, type QueryDb } from '../../src/testing/transactionQueryKit'
import type { ExpenseRepository } from '../../src/domain/ports/expenseRepository'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { PINNED_SQL, paymentsSql, pinnedSql } from './ledgerPartsSql'

const RANGE = { from: '2026-01', to: '2026-03' }
const BIG = 1_000_000

/** A scan of the table or of a lookup table. */
const SCAN = /^SCAN /
/** Walks every row the owner has, by whichever of the owner indexes. */
const OWNER_WIDE = /USING (COVERING )?INDEX idx_txn_owner(_date|_month_date)? \(owner=\?\)/
const MONTH_RANGE = /USING (COVERING )?INDEX idx_txn_owner_month_date \(owner=\? AND budget_month>\? AND budget_month<\?\)/

function expectNoScan(plan: string[]): void {
  expect(plan.filter((line) => SCAN.test(line)), `scans:\n${plan.join('\n')}`).toEqual([])
}

describe.each([{ stats: false }, { stats: true }])('query plans (table statistics: $stats)', ({ stats }) => {
  let kit: QueryDb
  let repo: ExpenseRepository

  beforeAll(() => {
    const others = Array.from({ length: 8 }, (_, i) => ({
      owner: `other${i}@example.com`,
      dataset: syntheticLedger({ months: 24, perMonth: 30, seed: 50 + i }),
    }))
    kit = queryDb(syntheticLedger({ months: 36, perMonth: 60, seed: 7 }), others)
    if (stats) kit.sqlite.exec('ANALYZE')
    repo = createD1ExpenseRepository({ DB: kit.d1 })
  })

  async function ran(run: () => Promise<unknown>) {
    kit.statements.length = 0
    await run()
    return [...kit.statements]
  }

  it('reads the pinned rows through the partial index, and every other row by key', async () => {
    const statements = await ran(() => repo.readLedgerReference(OWNER))
    const pinned = statements.find((s) => s.sql === pinnedSql(OWNER).sql)!
    const plan = planOf(kit.sqlite, pinned)
    const text = plan.join('\n')
    expectNoScan(plan)
    expect(text, text).toMatch(/SEARCH t USING INDEX idx_txn_pinned \(owner=\?\)/)
    expect(text, `reads every row of the owner:\n${text}`).not.toMatch(OWNER_WIDE)
    expect(text, `sorts:\n${text}`).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/)
    expect(text).toMatch(/idx_attachments_txn \(owner=\? AND transaction_id=\?\)/)
    expect(text).toMatch(/transaction_labels/)
  })

  it('finds the payments that rows point at by their key, never by walking the owner’s rows', async () => {
    const statements = await ran(() => repo.readLedgerReference(OWNER))
    const payments = statements.find((s) => s.sql === paymentsSql(OWNER).sql)!
    const plan = planOf(kit.sqlite, payments)
    const text = plan.join('\n')
    expectNoScan(plan)
    expect(text, text).toMatch(/COVERING INDEX idx_txn_settled_by \(owner=\? AND settled_by>\?\)/)
    expect(text, `walks the owner’s rows:\n${text}`).not.toMatch(/SEARCH t USING (COVERING )?INDEX idx_txn_owner(_date|_month_date)? \(owner=\?\)/)
  })

  it('counts rows per month from the index alone', async () => {
    const statements = await ran(() => repo.readLedgerReference(OWNER))
    const counts = statements.find((s) => /GROUP BY budget_month/.test(s.sql))!
    const plan = planOf(kit.sqlite, counts)
    expectNoScan(plan)
    expect(plan.join('\n')).toMatch(/SEARCH transactions USING COVERING INDEX idx_txn_owner_month_date \(owner=\?\)/)
  })

  it('reads a range of months by the month index alone: no sort, and no join to the account or statement', async () => {
    const [statement] = await ran(() => repo.readMonthRows(OWNER, RANGE, BIG))
    const plan = planOf(kit.sqlite, statement!)
    const text = plan.join('\n')
    expectNoScan(plan)
    expect(text, text).toMatch(MONTH_RANGE)
    expect(text, `reads every row of the owner:\n${text}`).not.toMatch(OWNER_WIDE)
    expect(text).toMatch(/idx_attachments_txn \(owner=\? AND transaction_id=\?\)/)
    expect(text, `sorts:\n${text}`).not.toMatch(/USE TEMP B-TREE/)
    expect(text, `joins:\n${text}`).not.toMatch(/accounts|account_statements/)
  })

  it('reads the paid statements of a range inside each account, and scans nothing but the few accounts', async () => {
    const [, accounts, paid] = await ran(() => repo.readMonthRows(OWNER, RANGE, BIG))
    for (const statement of [accounts!, paid!]) {
      const plan = planOf(kit.sqlite, statement)
      expect(plan.filter((line) => SCAN.test(line) && line !== 'SCAN accounts'), plan.join('\n')).toEqual([])
    }
    const text = planOf(kit.sqlite, paid!).join('\n')
    expect(text, text).toMatch(/SEARCH account_statements USING INDEX \S+ \(owner=\? AND account_id=\? AND year_month>\? AND year_month<\?\)/)
  })

  it('reads the cube of a range by the month index, and looks settled rows up by key', async () => {
    const [statement] = await ran(() => repo.readMonthCells(OWNER, RANGE, BIG))
    const plan = planOf(kit.sqlite, statement!)
    const text = plan.join('\n')
    expectNoScan(plan)
    expect(text, text).toMatch(MONTH_RANGE)
    expect(text, `reads every row of the owner:\n${text}`).not.toMatch(OWNER_WIDE)
    expect(text).toMatch(/COVERING INDEX idx_txn_settled_by \(owner=\? AND settled_by>\?\)/)
  })

  it('reads the same plans whatever range it is asked for, a single month or the whole span', async () => {
    const shapes = [{ from: '2026-02', to: '2026-02' }, { from: '2020-01', to: '2030-12' }]
    for (const range of shapes) {
      const [rows] = await ran(() => repo.readMonthRows(OWNER, range, BIG))
      const [cells] = await ran(() => repo.readMonthCells(OWNER, range, BIG))
      for (const statement of [rows!, cells!]) {
        const plan = planOf(kit.sqlite, statement)
        expectNoScan(plan)
        expect(plan.join('\n')).toMatch(MONTH_RANGE)
      }
    }
  })

  it('stops reading a range that is too big after the bound, whatever the range holds', async () => {
    const [statement] = await ran(() => repo.readMonthRows(OWNER, { from: '2020-01', to: '2030-12' }, 10))
    const plan = planOf(kit.sqlite, statement!).join('\n')
    expect(plan).toMatch(MONTH_RANGE)
    expect(plan, 'a sort sees every row before it can stop').not.toMatch(/USE TEMP B-TREE FOR ORDER BY/)
    expect(statement!.sql).toMatch(/LIMIT \?$/)
    expect(statement!.params.at(-1)).toBe(11)
  })
})

describe('the partial index', () => {
  it('is what the pinned read depends on: without it the plan reads every row the owner has', () => {
    const kit = queryDb(syntheticLedger({ months: 12, perMonth: 30, seed: 7 }))
    kit.sqlite.exec('DROP INDEX idx_txn_pinned')
    const { sql, params } = pinnedSql(OWNER)
    const text = planOf(kit.sqlite, { sql, params }).join('\n')
    expect(text).toMatch(OWNER_WIDE)
  })

  it('holds only pinned rows, so an ordinary row pays no written row for it', () => {
    const kit = queryDb(syntheticLedger({ months: 12, perMonth: 30, seed: 7 }))
    const rowCount = (kit.sqlite.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n
    const pinned = (kit.sqlite.prepare(`SELECT COUNT(*) AS n FROM transactions t WHERE t.owner = ? AND ${PINNED_SQL}`).get(OWNER) as { n: number }).n
    expect(pinned).toBeGreaterThan(0)
    expect(pinned).toBeLessThan(rowCount / 4)
  })
})
