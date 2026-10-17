/**
 * The usage statement counts every transaction of the owner once, so it reads that owner's rows and no
 * one else's. It must reach them through an index on the owner, never by scanning `transactions`, and
 * never by walking an index with no owner in it (`idx_txn_category`), which is what the planner picks for
 * a `GROUP BY category_id` once it has table statistics. The same holds for the label links, reached from
 * the owner's labels. The statement also reads the owner's categories and accounts (a few dozen rows,
 * which `loadDataset` reads the same way) and plans, which may be scanned when they are few.
 */
import { describe, expect, it } from 'vitest'
import { D1_MAX_BOUND_PARAMETERS } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, planOf, queryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { USAGE_COMPOUND_TERMS, USAGE_SQL, compoundTerms } from './usageSql'

function setup() {
  return queryDb(syntheticLedger({ months: 24, perMonth: 20, seed: 9 }), [
    { owner: OTHER_OWNER, dataset: syntheticLedger({ months: 12, perMonth: 15, seed: 8 }) },
    ...Array.from({ length: 6 }, (_, i) => ({
      owner: `owner${i}@example.com`,
      dataset: syntheticLedger({ months: 6, perMonth: 10, seed: 20 + i }),
    })),
  ])
}

describe.each([false, true])('the usage statement, with table statistics: %s', (analyze) => {
  it('reaches the owner’s transactions through an index on the owner and scans nothing that grows', async () => {
    const kit = setup()
    if (analyze) kit.sqlite.exec('ANALYZE')
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).readUsage(OWNER)

    const ran = kit.statements.filter((s) => s.sql === USAGE_SQL)
    expect(ran).toHaveLength(1)
    const plan = planOf(kit.sqlite, ran[0]!)
    const where = plan.join('\n')
    expect(plan.filter((l) => /\btransactions\b/.test(l)).every((l) => /^SEARCH transactions USING INDEX \w+ \(owner=\?\)$/.test(l)), where).toBe(true)
    expect(plan.some((l) => /^SEARCH transactions/.test(l)), where).toBe(true)
    expect(plan.some((l) => /SCAN (transactions|transaction_labels|tl|t|l)\b/.test(l)), where).toBe(false)
    expect(plan.some((l) => /idx_txn_category|idx_txn_account/.test(l)), where).toBe(false)
    expect(plan.some((l) => /SEARCH tl USING INDEX idx_transaction_labels_label \(label_id=\?\)/.test(l)), where).toBe(true)
  })

  it('binds the owner and nothing else, as one value, within D1’s limit', async () => {
    const kit = setup()
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).readUsage(OWNER)
    const ran = kit.statements.find((s) => s.sql === USAGE_SQL)!
    expect(ran.params).toEqual([OWNER])
    expect(ran.params.length).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS)
    expect(USAGE_SQL).not.toContain(OWNER)
    expect(kit.statements).toHaveLength(1)
  })
})

// With one owner in the database and statistics from ANALYZE, the owner index is no better than a scan and the planner
// walks `idx_txn_category` to get the groups in order, reading rows with no regard to the owner. A ledger of several
// owners hides it (the owner index is selective there), so this is the shape that shows what `+ 0` is for.
describe('the usage statement, in a database of one owner with table statistics', () => {
  it('does not walk an index that has no owner in it', async () => {
    const kit = queryDb(syntheticLedger({ months: 24, perMonth: 20, seed: 9 }))
    kit.sqlite.exec('ANALYZE')
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).readUsage(OWNER)
    const ran = kit.statements.find((s) => s.sql === USAGE_SQL)!
    const plan = planOf(kit.sqlite, ran)
    expect(plan.some((l) => /idx_txn_category|idx_txn_account/.test(l)), plan.join('\n')).toBe(false)
  })
})

describe('what a deployed D1 accepts', () => {
  it('is five terms in a compound SELECT, the most it takes, which SQLite itself would allow hundreds of', () => {
    expect(USAGE_COMPOUND_TERMS).toBe(5)
  })

  it('counts the terms however the operators are spelled', () => {
    expect(compoundTerms('select 1')).toBe(1)
    expect(compoundTerms('SELECT 1 UNION ALL SELECT 2')).toBe(2)
    expect(compoundTerms('select 1 union all select 2 union all select 3')).toBe(3)
    expect(compoundTerms('select 1 Union select 2 INTERSECT select 3 except select 4')).toBe(4)
    expect(compoundTerms('select exceptions, unions from t')).toBe(1)
  })
})
