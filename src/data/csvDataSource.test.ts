import { describe, expect, it } from 'vitest'
import { hasLedgerParts } from '../domain/data/dataSource'
import { assembleRows, byApiOrder, ledgerFor } from '../domain/ledger'
import { comparable } from '../testing/ledgerSource'
import { csvDataSource } from './csvDataSource'
import { loadLedger } from './ledgerLoader'

describe('csvDataSource, ledger parts', () => {
  it('serves the demo fixture in parts', () => {
    expect(hasLedgerParts(csvDataSource)).toBe(true)
  })

  it('reads a ledger that holds every row of the dataset it loads', async () => {
    const dataset = await csvDataSource.load()
    const loaded = await loadLedger(csvDataSource as Required<typeof csvDataSource>)
    expect(loaded.rowCount).toBe(dataset.transactions.length)
    expect(comparable(assembleRows(loaded.ledger).real)).toEqual(comparable(assembleRows(ledgerFor(dataset, '')).real))
  })

  it('names the same revision every time, because the fixture never changes', async () => {
    const first = await csvDataSource.readReferencePart!()
    const second = await csvDataSource.readReferencePart!()
    expect(first.revision).toBe(second.revision)
  })

  it('lists the rows in the order the API returns them, as the server does', async () => {
    const { transactions } = await csvDataSource.load()
    expect(transactions).toEqual([...transactions].sort(byApiOrder))
    const parts = await csvDataSource.readMonthsPart!({ from: '2026-01', to: '2026-12' })
    const inRange = transactions.filter((t) => t.budgetMonth >= '2026-01' && t.budgetMonth <= '2026-12')
    expect(parts.transactions.map((t) => t.id)).toEqual(inRange.map((t) => t.id))
  })
})
