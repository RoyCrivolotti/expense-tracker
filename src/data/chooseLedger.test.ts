import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FULL_HYDRATION_ROW_LIMIT } from '../domain/ledger'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import { memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { chooseLedger } from './chooseLedger'
import type { ExpenseDataSource } from './dataSource'
import { holdParts } from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'
import { saveLedgerSnapshot } from './ledgerSnapshot'

const dataset = syntheticLedger({ months: 8, perMonth: 8, seed: 6 })
const OWNER = 'alex@example.com'

const serving = (data = dataset) => Object.assign(memorySource(data), { canWrite: false, load: () => Promise.resolve(data) })

let idb: FakeIndexedDb
beforeEach(() => {
  idb = installFakeIndexedDb()
})
afterEach(() => {
  idb.uninstall()
  vi.unstubAllGlobals()
})

function setOnline(online: boolean) {
  vi.stubGlobal('navigator', { onLine: online })
}

describe('chooseLedger', () => {
  it('hands a source that cannot serve parts to the whole-dataset app without reading anything', async () => {
    const plain: ExpenseDataSource = { canWrite: false, load: () => Promise.resolve(dataset) }
    expect(await chooseLedger(plain, OWNER)).toBe('fallback')
  })

  it('reads the reference once, and the session that opens from the source it returns does not read it again', async () => {
    const source = serving()
    const chosen = await chooseLedger(source, OWNER)
    if (chosen === 'fallback') throw new Error('expected the ledger')
    await readLedgerParts(chosen.ledger)
    expect(source.calls.filter((call) => call === 'reference')).toHaveLength(1)
  })

  it('hands a ledger over the limit to the whole-dataset app, after one read of the reference', async () => {
    const source = serving()
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = async () => ({ ...(await read()), rowCount: FULL_HYDRATION_ROW_LIMIT + 1 })
    expect(await chooseLedger(source, OWNER)).toBe('fallback')
    expect(source.calls.filter((call) => call === 'reference')).toHaveLength(1)
  })

  it('goes on with the ledger when the reference cannot be read and this owner has saved one held in full', async () => {
    const source = serving()
    await saveLedgerSnapshot(OWNER, holdParts(await readLedgerParts(memorySource(dataset))), '2026-01')
    source.readReferencePart = () => Promise.reject(new Error('down'))
    const chosen = await chooseLedger(source, OWNER)
    expect(chosen).not.toBe('fallback')
  })

  it('hands back when the reference cannot be read and nothing is saved, or what is saved is a window', async () => {
    const source = serving()
    source.readReferencePart = () => Promise.reject(new Error('down'))
    expect(await chooseLedger(source, OWNER)).toBe('fallback')
    const windowed = holdParts(await readLedgerParts(memorySource(dataset), { policy: { fullBelowRows: 0, dataMonths: 2 } }))
    await saveLedgerSnapshot(OWNER, windowed, '2026-08')
    expect(await chooseLedger(source, OWNER)).toBe('fallback')
  })

  it('reads nothing offline, and goes on only with a snapshot of this owner’s that holds every row', async () => {
    setOnline(false)
    const source = serving()
    expect(await chooseLedger(source, OWNER)).toBe('fallback')
    await saveLedgerSnapshot(OWNER, holdParts(await readLedgerParts(memorySource(dataset))), '2026-01')
    expect(await chooseLedger(source, OWNER)).not.toBe('fallback')
    expect(await chooseLedger(source, 'sam@example.com')).toBe('fallback')
    expect(source.calls).toEqual([])
  })
})
