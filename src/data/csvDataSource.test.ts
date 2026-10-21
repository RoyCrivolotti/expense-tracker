import { describe, expect, it } from 'vitest'
import { hasLedgerParts } from '../domain/data/dataSource'
import { assembleRows, ledgerFor } from '../domain/ledger'
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
})
