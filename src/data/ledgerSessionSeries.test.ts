import { describe, expect, it } from 'vitest'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import { sortedMonths } from '../domain/engine/dates'
import { seriesFromTransactions } from '../domain/engine/recurringSeries'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { patchAfterCategory, patchAfterTransactionCreate } from '../ui/datasetPatches'
import { adversarialLedger } from '../testing/adversarialLedger'
import { makeTransaction } from '../testing/factories'
import { memorySource, type TestSource } from '../testing/ledgerSource'
import { holdParts } from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'
import { LedgerSession } from './ledgerSession'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const dataset = adversarialLedger()
const newest = sortedMonths(dataset.transactions.map((t) => t.budgetMonth)).at(-1)!
const seriesCalls = (source: TestSource) => source.calls.filter((c) => c === 'series').length
const flush = () => new Promise((resolve) => setTimeout(resolve, 5))

/** A monthly charge for a description nothing else uses, so that it is a series of its own. */
const charge = (id: number, month: number): Transaction =>
  makeTransaction({ id, description: 'Cloud backup', date: `2026-0${month}-04`, budgetMonth: `2026-0${month}`, amountCents: 900 })

/** The ledger after `added`, which is what the server holds once a write has landed. */
const after = (...added: Transaction[]): ExpenseDataset => ({ ...dataset, transactions: [...dataset.transactions, ...added] })

async function open(source = memorySource(dataset), policy = WINDOWED) {
  const session = new LedgerSession(source, { policy })
  await session.open()
  source.calls.length = 0
  return { session, source }
}

describe('LedgerSession, the recurring series', () => {
  it('reads nothing until a screen watches, then the series of every row, once', async () => {
    const { session, source } = await open()
    await flush()
    expect(seriesCalls(source)).toBe(0)
    expect(session.getState().series).toBeNull()
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(1)
    expect(session.getState().series).toEqual(seriesFromTransactions(dataset.transactions))
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(1)
  })

  it('reads nothing for a ledger held in full, where the rows are the series', async () => {
    const full: HydrationPolicy = { fullBelowRows: dataset.transactions.length, dataMonths: HYDRATED_DATA_MONTHS }
    const { session, source } = await open(memorySource(dataset), full)
    session.watchSeries()
    await flush()
    expect(session.getState().held!.cells).toBeNull()
    expect(source.calls).toEqual([])
    expect(session.getState().series).toBeNull()
  })

  it('reads it again after a write that changed rows, and holds the series of the rows then', async () => {
    const { session, source } = await open()
    session.watchSeries()
    await flush()
    const added = [charge(900_001, 1), charge(900_002, 2), charge(900_003, 3)]
    source.dataset = after(...added)
    session.patch((d) => added.reduce(patchAfterTransactionCreate, d))
    await flush()
    expect(seriesCalls(source)).toBe(2)
    const held = session.getState().series!
    expect(held).toEqual(seriesFromTransactions(source.dataset.transactions))
    expect(held.some((s) => s.label === 'Cloud backup')).toBe(true)
  })

  it('reads nothing after a write that changed no row', async () => {
    const { session, source } = await open()
    session.watchSeries()
    await flush()
    const category = dataset.categories[0]!
    session.patch((d) => patchAfterCategory(d, { ...category, name: `${category.name} renamed` }))
    await flush()
    expect(seriesCalls(source)).toBe(1)
  })

  it('reads it once, not once a write, when several land while a read is on its way', async () => {
    const { session, source } = await open()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const read = source.readSeriesPart.bind(source)
    source.readSeriesPart = async () => {
      const part = await read()
      await gate
      return part
    }
    session.watchSeries()
    await flush()
    const added = [charge(900_001, 1), charge(900_002, 2), charge(900_003, 3)]
    source.dataset = after(...added)
    for (const row of added) session.patch((d) => patchAfterTransactionCreate(d, row))
    source.readSeriesPart = read
    release()
    await flush()
    expect(seriesCalls(source)).toBe(2)
    expect(session.getState().series).toEqual(seriesFromTransactions(source.dataset.transactions))
  })

  it('reads nothing while no screen is watching, and catches up when one is', async () => {
    const { session, source } = await open()
    const stop = session.watchSeries()
    await flush()
    stop()
    const added = charge(900_001, 1)
    source.dataset = after(added)
    session.patch((d) => patchAfterTransactionCreate(d, added))
    await flush()
    expect(seriesCalls(source)).toBe(1)
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(2)
    expect(session.getState().series).toEqual(seriesFromTransactions(source.dataset.transactions))
  })

  it('reads the ledger again when the series was read at a revision the rows were not', async () => {
    const { session, source } = await open()
    source.move('r1')
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(1)
    expect(source.calls).toContain('reference')
    expect(session.getState().held!.revision).toBe('r1')
  })

  it('gives up after a few tries when the ledger will not hold still, instead of reading for ever', async () => {
    const { session, source } = await open()
    const read = source.readSeriesPart.bind(source)
    source.readSeriesPart = async () => ({ ...(await read()), revision: 'elsewhere' })
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(3)
    expect(source.calls.filter((c) => c === 'reference')).toHaveLength(2)
  })

  it('reports a read that fails, keeps what it held, and reads again at the next refresh', async () => {
    const { session, source } = await open()
    const read = source.readSeriesPart.bind(source)
    source.readSeriesPart = () => Promise.reject(new Error('series are down'))
    session.watchSeries()
    await flush()
    expect(session.getState().error).toBe('series are down')
    expect(session.getState().series).toBeNull()
    source.readSeriesPart = read
    await session.refresh()
    await flush()
    expect(session.getState().series).toEqual(seriesFromTransactions(dataset.transactions))
    expect(session.getState().error).toBeNull()
  })

  it('reads nothing from a snapshot, which is offline', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    session.restore(holdParts(await readLedgerParts(source, { policy: WINDOWED })), newest)
    source.calls.length = 0
    session.watchSeries()
    await flush()
    expect(source.calls).toEqual([])
  })
})
