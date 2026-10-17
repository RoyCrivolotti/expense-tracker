// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isPinned, settlementPaymentIds } from '../../src/domain/ledger'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { randomLedger } from '../../src/testing/randomLedger'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, awkwardLedger, queryDb } from '../../src/testing/transactionQueryKit'
import { PINNED_SQL, UNPINNED_SQL, cubeSql, monthCountsSql, monthRowsSql, paymentsSql, pinnedSql } from './ledgerPartsSql'

const RANGE = { from: '2026-01', to: '2026-03' }
const ALL = [
  pinnedSql(OWNER),
  paymentsSql(OWNER),
  monthRowsSql(OWNER, RANGE, 5_000),
  cubeSql(OWNER, RANGE, 6_000),
  monthCountsSql(OWNER),
]

describe('the statements', () => {
  it('bind the owner first and the range and limits after it, and never put a value in the text', () => {
    for (const { sql, params } of ALL) {
      expect(params[0], sql).toBe(OWNER)
      expect(sql).not.toContain(OWNER)
      expect(sql).not.toContain('2026-01')
      expect(sql.match(/\?/g)?.length, sql).toBe(params.length)
    }
  })

  it('bind a handful of values each, however big the ledger, far below the 100 D1 allows', () => {
    expect(Math.max(...ALL.map((s) => s.params.length))).toBeLessThanOrEqual(6)
  })

  it('scope every read of transactions to the owner', () => {
    for (const { sql } of ALL) expect(sql, sql).toMatch(/owner = \?/)
  })
})

describe('PINNED_SQL and UNPINNED_SQL', () => {
  const ledgers = [
    syntheticLedger({ months: 24, perMonth: 30, seed: 5 }),
    adversarialLedger(),
    awkwardLedger(),
    ...Array.from({ length: 30 }, (_, seed) => randomLedger(seed)),
  ]

  it('say what isPinned says about a row’s own columns, and are exact complements', () => {
    let rows = 0
    for (const ledger of ledgers) {
      const { sqlite } = queryDb(ledger)
      const payments = settlementPaymentIds(ledger.transactions)
      const read = sqlite
        .prepare(`SELECT t.id AS id, ${PINNED_SQL} AS pinned, ${UNPINNED_SQL} AS unpinned FROM transactions t WHERE t.owner = ?`)
        .all(OWNER) as Array<{ id: number; pinned: number; unpinned: number }>
      expect(read.length).toBe(ledger.transactions.length)
      for (const { id, pinned, unpinned } of read) {
        const row = ledger.transactions.find((t) => t.id === id)!
        // isPinned also counts being pointed at, which is not a column of the row itself.
        const own = isPinned(row, new Set<number>())
        expect(pinned === 1, `row ${id} pinned`).toBe(own)
        expect(unpinned === 1, `row ${id} unpinned`).toBe(!own)
        expect(payments.has(id) || own || unpinned === 1).toBe(true)
        rows += 1
      }
    }
    expect(rows).toBeGreaterThan(3_000)
  })
})
