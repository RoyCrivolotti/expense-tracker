/**
 * The read of the rows added last must stay a walk of the owner's index backwards: `limit` rows read, nothing
 * sorted, never another owner's rows, with and without table statistics.
 */
import { describe, expect, it } from 'vitest'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, planOf, queryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { recentSql } from './transactionQuerySql'

function setup() {
  return queryDb(syntheticLedger({ months: 24, perMonth: 20, seed: 9 }), [
    { owner: OTHER_OWNER, dataset: syntheticLedger({ months: 12, perMonth: 15, seed: 8 }) },
  ])
}

describe.each([false, true])('the recently added read, with table statistics: %s', (analyze) => {
  it('walks the owner index from the highest id, sorts nothing and reads the limit', async () => {
    const kit = setup()
    if (analyze) kit.sqlite.exec('ANALYZE')
    kit.statements.length = 0
    const rows = await createD1ExpenseRepository({ DB: kit.d1 }).recentTransactions(OWNER, 8)
    expect(rows).toHaveLength(8)
    const ran = kit.statements.filter((s) => s.sql === recentSql(OWNER, 8).sql)
    expect(ran).toHaveLength(1)
    expect(ran[0]!.params).toEqual([OWNER, 8])
    const plan = planOf(kit.sqlite, ran[0]!)
    expect(plan[0], plan.join('\n')).toMatch(/^SEARCH t USING INDEX idx_txn_owner \(owner=\?\)$/)
    expect(plan.join('\n')).not.toMatch(/TEMP B-TREE/)
  })
})

describe('the recently added read, on both repositories', () => {
  it('is the owner’s highest ids, highest first, as the dataset carries them', async () => {
    const kit = setup()
    const repo = createD1ExpenseRepository({ DB: kit.d1 })
    const all = await repo.loadDataset(OWNER)
    const expected = [...all.transactions].sort((a, b) => b.id - a.id).slice(0, 8)
    expect(await repo.recentTransactions(OWNER, 8)).toEqual(expected)
    expect(await repo.recentTransactions(OWNER, 1)).toEqual(expected.slice(0, 1))
  })
})
