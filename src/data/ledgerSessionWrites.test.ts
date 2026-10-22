import { describe, expect, it } from 'vitest'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import type { Transaction } from '../domain/types'
import { patchAfterBulkDelete, patchAfterBulkUpdate } from '../ui/datasetPatches'
import { adversarialLedger } from '../testing/adversarialLedger'
import { memorySource, type TestSource } from '../testing/ledgerSource'
import { LedgerSession } from './ledgerSession'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const FULL: HydrationPolicy = { fullBelowRows: 1_000_000, dataMonths: HYDRATED_DATA_MONTHS }
const dataset = adversarialLedger()
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 5))
}

async function open(policy: HydrationPolicy) {
  const source = memorySource(dataset)
  const session = new LedgerSession(source, { policy })
  await session.open()
  await flush()
  source.calls.length = 0
  return { session, source }
}

const heldIds = (session: LedgerSession): Set<number> => {
  const held = session.getState().held!
  return new Set([...held.pinned, ...[...held.rows.values()].flat()].map((row) => row.id))
}

/** A real row that the session holds only as a sum, in a month other than the ones it was opened on. */
const unheldRow = (session: LedgerSession): Transaction => {
  const held = heldIds(session)
  const row = dataset.transactions.find((t) => !held.has(t.id))
  if (!row) throw new Error('the ledger is held in full')
  return row
}

const heldRow = (session: LedgerSession): Transaction => {
  const held = heldIds(session)
  const row = dataset.transactions.find((t) => held.has(t.id) && !session.getState().held!.pinned.some((p) => p.id === t.id))
  if (!row) throw new Error('nothing is held as rows')
  return row
}

/** What the server holds once `row` has been edited. */
const served = (source: TestSource, row: Transaction): void => {
  source.dataset = { ...dataset, transactions: dataset.transactions.map((t) => (t.id === row.id ? row : t)) }
}

const referenceReads = (source: TestSource) => source.calls.filter((call) => call === 'reference').length
const seriesReads = (source: TestSource) => source.calls.filter((call) => call === 'series').length

describe('LedgerSession, a write to rows that are not held', () => {
  it('reads the ledger again, so the sums of the months it reached are right', async () => {
    const { session, source } = await open(WINDOWED)
    const row = unheldRow(session)
    const other = dataset.categories.find((category) => category.id !== row.categoryId)!
    const edited = { ...row, categoryId: other.id }
    served(source, edited)

    const changed = session.patch((d) => patchAfterBulkUpdate(d, [edited]), { ids: [row.id], patch: { categoryId: other.id } })
    await flush()

    expect(changed).toBe(true)
    expect(referenceReads(source)).toBe(1)
    const fresh = new LedgerSession(memorySource(source.dataset), { policy: WINDOWED })
    await fresh.open()
    expect(session.getState().held!.cells).toEqual(fresh.getState().held!.cells)
  })

  it('does not read again for a write to rows it holds, and judges that before the patch removes them', async () => {
    const { session, source } = await open(WINDOWED)
    const row = heldRow(session)

    session.patch((d) => patchAfterBulkDelete(d, [row.id]), { ids: [row.id] })
    await flush()

    expect(heldIds(session).has(row.id)).toBe(false)
    expect(referenceReads(source)).toBe(0)
  })

  it('reads again for a write that named its rows another way, or none, even to rows it holds', async () => {
    const { session, source } = await open(WINDOWED)
    const row = heldRow(session)

    const changed = session.patch((d) => d, { patch: {} })
    await flush()

    expect(changed).toBe(true)
    expect(referenceReads(source)).toBe(1)
    expect(heldIds(session).has(row.id)).toBe(true)
  })

  it('reads nothing for a ledger held in full that the patch already shows, and everything for a write it cannot show', async () => {
    const { session, source } = await open(FULL)
    // A row nothing else points at, whose removal the patch alone shows.
    const row = dataset.transactions.find((t) => t.type === 'expense' && !t.planId && !t.settledBy && !t.flagId && !t.reportCount)!

    session.patch((d) => patchAfterBulkDelete(d, [row.id]), { ids: [row.id] })
    await flush()
    expect(referenceReads(source)).toBe(0)

    session.patch((d) => d, { patch: { categoryId: 1 } })
    await flush()
    expect(referenceReads(source)).toBe(1)
  })

  it('reads a write the user cannot see back as a change, so a list is read again, but not a patch that changed nothing', async () => {
    const { session } = await open(WINDOWED)
    expect(session.patch((d) => d)).toBe(false)
    expect(session.patch((d) => d, { ids: [heldRow(session).id] })).toBe(false)
  })
})

describe('LedgerSession, the series after a write to rows that are not held', () => {
  const read = async (patch?: object) => {
    const { session, source } = await open(WINDOWED)
    session.watchSeries()
    await flush()
    source.calls.length = 0
    const row = unheldRow(session)
    session.patch((d) => d, { ids: [row.id], ...(patch ? { patch } : {}) })
    await flush()
    return seriesReads(source)
  }

  it.each([
    ['a rename', { description: 'Renamed' }],
    ['a new date', { date: '2020-01-02' }],
    ['a new category', { categoryId: 3 }],
    ['rows removed', undefined],
  ])('reads them again, for a screen that shows them, after %s', async (_name, patch) => {
    expect(await read(patch)).toBe(1)
  })

  it.each([
    ['a flag', { flagId: 2 }],
    ['labels', {}],
  ])('does not read them again after %s', async (_name, patch) => {
    expect(await read(patch)).toBe(0)
  })
})
