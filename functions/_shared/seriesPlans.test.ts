/**
 * What the series read costs in rows, and the one thing it must never do: read another owner's rows.
 * The statements are the ones the repository actually ran. The series statement is allowed to read every
 * row of the owner once (a series is defined by the whole history), so it is held to an owner-scoped
 * index search, never a scan of the table, with and without table statistics, among several owners.
 */
import { describe, expect, it } from 'vitest'
import { D1_MAX_BOUND_PARAMETERS } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, planOf, queryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { PENDING_ROWS_SQL } from './descriptionNormBackfill'
import { SERIES_SQL } from './seriesSql'

function setup() {
  const others = Array.from({ length: 8 }, (_, i) => ({
    owner: `owner${i}@example.com`,
    dataset: syntheticLedger({ months: 6, perMonth: 10, seed: 20 + i }),
  }))
  return queryDb(syntheticLedger({ months: 24, perMonth: 20, seed: 9 }), [
    { owner: OTHER_OWNER, dataset: syntheticLedger({ months: 12, perMonth: 15, seed: 8 }) },
    ...others,
  ])
}

describe.each([false, true])('the series statement, with table statistics: %s', (analyze) => {
  it('searches the owner’s rows through an index and never scans the table', async () => {
    const kit = setup()
    if (analyze) kit.sqlite.exec('ANALYZE')
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).readSeries(OWNER)

    const ran = kit.statements.filter((s) => s.sql === SERIES_SQL)
    expect(ran).toHaveLength(1)
    const plan = planOf(kit.sqlite, ran[0]!)
    const reads = plan.filter((line) => /transactions/.test(line) && !/CTE|SUBQUERY|CO-ROUTINE/.test(line))
    expect(reads.length, plan.join('\n')).toBeGreaterThan(0)
    for (const line of reads) {
      expect(line, plan.join('\n')).toMatch(/SEARCH transactions USING (COVERING )?INDEX \w+ \(owner=\?/)
      expect(line).not.toMatch(/SCAN transactions/)
    }
  })

  it('stays inside D1’s bound-parameter limit and binds the owner and nothing else it could be asked for', async () => {
    const kit = setup()
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).readSeries(OWNER)
    const ran = kit.statements.find((s) => s.sql === SERIES_SQL)!
    expect(ran.params).toHaveLength(3)
    expect(ran.params[0]).toBe(OWNER)
    expect(ran.params.length).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS)
    expect(SERIES_SQL).not.toContain(OWNER)
  })
})

describe('the read of the rows still waiting', () => {
  it('is the only other statement a series request runs when nothing is waiting, and it reads no more than one row', async () => {
    const kit = setup()
    kit.statements.length = 0
    await createD1ExpenseRepository({ DB: kit.d1 }).readSeries(OWNER)
    expect(kit.statements.map((s) => s.sql)).toEqual([PENDING_ROWS_SQL, SERIES_SQL])
  })
})
