/**
 * The cost of a suggestion is the rows SQLite visits, which D1 bills as rows read. The statement skips
 * from one matching description to the next through `idx_txn_owner_desc_norm`, a seek each, reading the
 * index alone, and finds the newest eligible row of each with one more, so it must never scan the table or
 * sort, for every shape it comes in (with and without a month, with and without an upper end to the range),
 * and with and without table statistics, among several owners. The walk must stay a covering read: a
 * condition on a column the index does not hold would make every step read table rows.
 */
import { describe, expect, it } from 'vitest'
import { D1_MAX_BOUND_PARAMETERS } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, planOf, queryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'

const SHAPES = [
  { name: 'a prefix', prefix: 'ma', before: undefined, range: 'owner=? AND description_norm>? AND description_norm<?' },
  { name: 'a prefix before a month', prefix: 'ma', before: '2026-01', range: 'owner=? AND description_norm>? AND description_norm<?' },
  { name: 'a prefix with no upper end', prefix: '\u{10FFFF}\u{10FFFF}', before: undefined, range: 'owner=? AND description_norm>?' },
  { name: 'a prefix with no upper end before a month', prefix: '\u{10FFFF}z', before: '2026-01', range: 'owner=? AND description_norm>? AND description_norm<?' },
]

describe.each([false, true])('the suggest statement, with table statistics: %s', (analyze) => {
  it.each(SHAPES)('searches the owner’s prefix range through the index for $name', async ({ prefix, before, range }) => {
    const kit = queryDb(syntheticLedger({ months: 24, perMonth: 20, seed: 9 }), [
      { owner: OTHER_OWNER, dataset: syntheticLedger({ months: 12, perMonth: 15, seed: 8 }) },
      ...Array.from({ length: 6 }, (_, i) => ({
        owner: `owner${i}@example.com`,
        dataset: syntheticLedger({ months: 6, perMonth: 10, seed: 20 + i }),
      })),
    ])
    if (analyze) kit.sqlite.exec('ANALYZE')
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).suggestDescriptions(OWNER, { prefix, limit: 8, ...(before ? { before } : {}) })

    const ran = kit.statements.find((s) => /WITH RECURSIVE keys/.test(s.sql))!
    const plan = planOf(kit.sqlite, ran)
    const where = plan.join('\n')
    const reads = plan.filter((line) => line.startsWith('SEARCH transactions'))
    const walk = 'SEARCH transactions USING COVERING INDEX idx_txn_owner_desc_norm'
    // The first description and the next one after each read the index alone; the newest eligible row of each
    // is one seek and then the rows of that description from the newest down, which filter on the table's columns.
    expect(reads, where).toHaveLength(3)
    expect(reads[0], where).toBe(`${walk} (${range})`)
    expect(reads[1], where).toBe(`${walk} (${range})`)
    expect(reads[2], where).toBe('SEARCH transactions USING INDEX idx_txn_owner_desc_norm (owner=? AND description_norm=?)')
    expect(plan.filter((line) => line.startsWith('SEARCH t ')), where).toEqual(['SEARCH t USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN'])
    expect(plan.some((line) => /SCAN (transactions|t)\b|TEMP B-TREE/.test(line)), where).toBe(false)
  })
})

describe('the statement’s values', () => {
  it('binds the owner, the prefix, its upper end, the month and the cap, and never puts them in the text', async () => {
    const kit = queryDb(syntheticLedger({ months: 3, perMonth: 10, seed: 1 }))
    await createD1ExpenseRepository({ DB: kit.d1 }).suggestDescriptions(OWNER, { prefix: 'ma', limit: 8, before: '2026-01' })
    const ran = kit.statements.find((s) => /WITH RECURSIVE keys/.test(s.sql))!
    expect(ran.params).toEqual([OWNER, 'ma', 'mb', '2026-01', 501])
    expect(ran.params.length).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS)
    expect(new Set(ran.sql.match(/\?\d/g)).size).toBe(ran.params.length)
    expect(ran.sql).not.toContain(OWNER)
    expect(ran.sql).not.toContain('2026-01')
  })

  it('reads only the readiness check besides the one statement', async () => {
    const kit = queryDb(syntheticLedger({ months: 3, perMonth: 10, seed: 1 }))
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).suggestDescriptions(OWNER, { prefix: 'ma', limit: 8 })
    expect(kit.statements).toHaveLength(2)
  })
})
