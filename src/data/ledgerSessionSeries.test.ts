import { afterEach, describe, expect, it, vi } from 'vitest'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import { sortedMonths } from '../domain/engine/dates'
import { seriesFromTransactions } from '../domain/engine/recurringSeries'
import type { ExpenseDataset, Transaction } from '../domain/types'
import {
  patchAfterCategory,
  patchAfterInstallmentPlanDelete,
  patchAfterTransactionCreate,
  patchAfterTransactionUpdate,
} from '../ui/datasetPatches'
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

afterEach(() => {
  vi.useRealTimers()
})

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

  it('reads nothing after a write that could change a series while the screen that uses them is mounted, and reads them when the next one mounts', async () => {
    const { session, source } = await open()
    const stop = session.watchSeries()
    await flush()
    const added = [charge(900_001, 1), charge(900_002, 2), charge(900_003, 3)]
    source.dataset = after(...added)
    session.patch((d) => added.reduce(patchAfterTransactionCreate, d))
    await flush()
    expect(seriesCalls(source)).toBe(1)
    expect(session.getState().series).toEqual(seriesFromTransactions(dataset.transactions))
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(2)
    expect(session.getState().series).toEqual(seriesFromTransactions(source.dataset.transactions))
    stop()
  })

  it.each([
    ['a category renamed', (d: ExpenseDataset) => patchAfterCategory(d, { ...d.categories[0]!, name: 'Renamed' })],
    ['a flag put on a row', (d: ExpenseDataset) => patchAfterTransactionUpdate(d, { ...d.transactions[0]!, flagId: d.flags[0]!.id })],
    ['labels set on a row', (d: ExpenseDataset) => patchAfterTransactionUpdate(d, { ...d.transactions[0]!, labelIds: [d.labels[0]!.id] })],
    ['a note written on a row', (d: ExpenseDataset) => patchAfterTransactionUpdate(d, { ...d.transactions[0]!, notes: 'noted' })],
  ])('treats the series as current after %s', async (_name, write) => {
    const { session, source } = await open()
    session.watchSeries()
    await flush()
    session.patch(write)
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(1)
  })

  it('reads them again at the next mount after a write the server cascaded, though a later write hides what it moved', async () => {
    const { session, source } = await open()
    const stop = session.watchSeries()
    await flush()
    stop()
    expect(seriesCalls(source)).toBe(1)

    // The server turns the instalments of a deleted plan into rows of their own, which the patch does not show.
    source.move('r1')
    session.patch((d) => patchAfterInstallmentPlanDelete(d, d.installmentPlans[0]!.id))
    await flush()
    await flush()
    // A write after it leaves the revision of the rows unknown, which must not read as current.
    session.patch((d) => ({ ...d, settings: { ...d.settings, openingCashCents: 7 } }))
    await flush()
    expect(session.getState().held!.revision).toBeNull()

    session.watchSeries()
    await flush()

    expect(seriesCalls(source)).toBe(2)
  })

  it('holds the series as they were read when a write lands while they are being read, and reads them again at the next mount', async () => {
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
    expect(seriesCalls(source)).toBe(1)
    expect(session.getState().series).toEqual(seriesFromTransactions(dataset.transactions))
    session.watchSeries()
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

  it('says so, after a few tries, when the series will not match the rows, and does not start again until a refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'))
    const { session, source } = await open()
    const read = source.readSeriesPart.bind(source)
    source.readSeriesPart = async () => ({ ...(await read()), revision: 'elsewhere' })
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(3)
    expect(source.calls.filter((c) => c === 'reference')).toHaveLength(2)
    expect(session.getState().error).toMatch(/could not be matched/i)
    expect(session.getState().series).not.toBeNull()
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(3)
    vi.setSystemTime(new Date('2026-10-22T10:02:00Z'))
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(6)
  })

  it('reports a read that fails, says nothing is held, holds off for a minute, and reads again at a refresh, which clears the report', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'))
    const { session, source } = await open()
    const read = source.readSeriesPart.bind(source)
    source.readSeriesPart = () => {
      source.calls.push('series')
      return Promise.reject(new Error('series are down'))
    }
    session.watchSeries()
    await flush()
    expect(session.getState()).toMatchObject({ error: 'series are down', series: null, seriesFailed: true })
    session.watchSeries()
    await flush()
    expect(seriesCalls(source)).toBe(1)
    source.readSeriesPart = read
    await session.refresh()
    await flush()
    expect(session.getState().series).toEqual(seriesFromTransactions(dataset.transactions))
    expect(session.getState()).toMatchObject({ error: null, seriesFailed: false })
  })

  it('takes away the report of a failed read when a later read works, and no other report', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'))
    const { session, source } = await open()
    const read = source.readSeriesPart.bind(source)
    source.readSeriesPart = () => Promise.reject(new Error('series are down'))
    session.watchSeries()
    await flush()
    expect(session.getState().error).toBe('series are down')
    source.readSeriesPart = read
    vi.setSystemTime(new Date('2026-10-22T10:05:00Z'))
    session.watchSeries()
    await flush()
    expect(session.getState()).toMatchObject({ error: null, seriesFailed: false })
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
