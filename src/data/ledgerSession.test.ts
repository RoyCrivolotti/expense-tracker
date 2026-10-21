import { describe, expect, it } from 'vitest'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, assembleRows, buildLedger } from '../domain/ledger'
import type { Ledger } from '../domain/ledger'
import { sortedMonths } from '../domain/engine/dates'
import { withoutFlag } from '../domain/engine/flagGroups'
import type { ExpenseDataset, Transaction } from '../domain/types'
import {
  patchAfterAttachmentAdd,
  patchAfterFlagDelete,
  patchAfterInstallmentPlanCreate,
  patchAfterTransactionCreate,
  patchAfterTransactionUpdate,
} from '../ui/datasetPatches'
import { adversarialLedger } from '../testing/adversarialLedger'
import { makeAttachment, makeTransaction } from '../testing/factories'
import { comparable, memorySource, type TestSource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { ledgerOfHeld } from './ledgerHold'
import { LedgerSession, rangesOfMonths } from './ledgerSession'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const dataset = adversarialLedger()
const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
const newest = months.at(-1)!

function listsOf(ledger: Ledger) {
  const { real, linear } = assembleRows(ledger)
  return { real: comparable(real), linear: comparable(linear) }
}

/**
 * Holds the answer to the next calls of a kind until the test lets it through. The ledger is read when the
 * call is made, so a write the test makes after that is one the answer does not know of: the case a refresh
 * has to survive.
 */
function gated(source: TestSource) {
  const gate = new Map<string, Promise<void>>()
  const hold = (kind: 'reference' | 'months' | 'cube') => {
    let release = () => {}
    gate.set(kind, new Promise<void>((resolve) => (release = resolve)))
    return () => {
      release()
      gate.delete(kind)
    }
  }
  const late = async <T>(kind: string, answer: Promise<T>): Promise<T> => {
    const result = await answer
    const pending = gate.get(kind)
    if (pending) await pending
    return result
  }
  const read = { reference: source.readReferencePart.bind(source), months: source.readMonthsPart.bind(source), cube: source.readCubePart.bind(source) }
  source.readReferencePart = () => late('reference', read.reference())
  source.readMonthsPart = (range) => late('months', read.months(range))
  source.readCubePart = (range) => late('cube', read.cube(range))
  return hold
}

const calls = (source: TestSource, prefix: string) => source.calls.filter((c) => c.startsWith(prefix))
const flush = () => new Promise((resolve) => setTimeout(resolve, 5))

const row = (id: number, month: string, over: Partial<Transaction> = {}) =>
  makeTransaction({ id, date: `${month}-12`, budgetMonth: month, description: `New ${id}`, ...over })

describe('rangesOfMonths', () => {
  it('joins consecutive months and keeps the gaps apart', () => {
    expect(rangesOfMonths(['2026-03', '2026-01', '2026-02', '2026-05', '2026-05'])).toEqual([
      { from: '2026-01', to: '2026-03' },
      { from: '2026-05', to: '2026-05' },
    ])
    expect(rangesOfMonths([])).toEqual([])
  })
})

describe('LedgerSession, opening and looking at months', () => {
  it('opens on the newest month with the window around it', async () => {
    const session = new LedgerSession(memorySource(dataset), { policy: WINDOWED })
    await session.open()
    const { held, viewed } = session.getState()
    expect(viewed).toBe(newest)
    expect(held!.rows.size).toBe(HYDRATED_DATA_MONTHS)
  })

  it('reads the window of another month when it is shown, with a loading state while it does, and keeps the newest window', async () => {
    const source = memorySource(dataset)
    const release = gated(source)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    const states: boolean[] = []
    session.subscribe(() => states.push(session.getState().hydrating))
    const open = release('months')
    const shown = session.view(months[20]!)
    await flush()
    expect(session.getState().hydrating).toBe(true)
    expect(session.getState().viewed).toBe(months[20])
    open()
    await shown
    const { held, hydrating } = session.getState()
    expect(hydrating).toBe(false)
    expect(states).toContain(true)
    expect(held!.rows.has(months[20]!)).toBe(true)
    expect(held!.rows.has(newest)).toBe(true)
    expect(calls(source, 'months:').length).toBeGreaterThan(0)
    expect(listsOf(ledgerOfHeld(held!))).toEqual(listsOf(buildLedger(dataset, held!.rows.keys())))
  })

  it('reads nothing when the month shown is already held, or for a ledger held in full', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    await session.view(newest)
    expect(source.calls).toEqual([])
    const small = memorySource(syntheticLedger({ months: 12, perMonth: 10, seed: 1 }))
    const full = new LedgerSession(small)
    await full.open()
    small.calls.length = 0
    await full.view('2020-01')
    expect(small.calls).toEqual([])
  })

  it('gives up the least recently used months beyond the cap and never the ones the screens want', async () => {
    const session = new LedgerSession(memorySource(dataset), { policy: WINDOWED, maxHeldMonths: 20 })
    await session.open()
    for (const month of [months[5]!, months[30]!, months[45]!, months[12]!]) await session.view(month)
    const { held } = session.getState()
    expect(held!.rows.size).toBeLessThanOrEqual(26)
    expect(held!.rows.has(months[12]!)).toBe(true)
    expect(held!.rows.has(newest)).toBe(true)
    expect(listsOf(ledgerOfHeld(held!))).toEqual(listsOf(buildLedger(dataset, held!.rows.keys())))
  })

  it('reads the ledger again when a month it reads comes back under another revision', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    source.before = (call) => {
      if (call.startsWith('months:') && source.revision === 'r0') source.move('r1')
    }
    await session.view(months[10]!)
    expect(calls(source, 'reference').length).toBeGreaterThan(0)
    expect(session.getState().held!.revision).toBe('r1')
    expect(session.getState().held!.rows.has(months[10]!)).toBe(true)
  })

  it('reads the ledger again, not a month, when a write has made its revision unknown', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    session.patch((d) => patchAfterTransactionCreate(d, row(900_001, newest)))
    expect(session.getState().held!.revision).toBeNull()
    source.calls.length = 0
    await session.view(months[10]!)
    expect(calls(source, 'reference').length).toBeGreaterThan(0)
    expect(session.getState().held!.rows.has(months[10]!)).toBe(true)
  })
})

describe('LedgerSession, a month being read and a write to it', () => {
  it('reads the month again when a row was added to it while it was being read', async () => {
    const source = memorySource(dataset)
    const release = gated(source)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    const month = months[10]!
    const added = row(900_008, month, { amountCents: 3_333 })
    const open = release('months')
    const shown = session.view(month)
    await flush()
    source.dataset = { ...dataset, transactions: [...dataset.transactions, added] }
    session.patch((d) => patchAfterTransactionCreate(d, added))
    // The sums of the month are read again and give the revision back before the rows arrive.
    await flush()
    expect(session.getState().held!.revision).toBe('r0')
    open()
    await shown
    await flush()
    const rows = session.getState().held!.rows.get(month)
    expect(rows?.some((t) => t.id === added.id)).toBe(true)
    expect(rows).toHaveLength((dataset.transactions.filter((t) => t.budgetMonth === month).length) + 1)
  })
})

describe('LedgerSession, receipts', () => {
  const small = syntheticLedger({ months: 12, perMonth: 10, seed: 1 })
  const withCounts = small.attachments.map((a) => a.transactionId)
  const ids = [...new Set(withCounts)]

  async function opened() {
    const source = memorySource(small)
    const session = new LedgerSession(source)
    await session.open()
    source.calls.length = 0
    return { source, session }
  }

  it('has read no list when it opens, and reads the lists asked for once each', async () => {
    const { source, session } = await opened()
    expect(session.getState().held!.receipts.size).toBe(0)
    session.loadReceipts([ids[0]!, ids[1]!])
    session.loadReceipts([ids[0]!])
    await flush()
    expect(calls(source, 'receipts:').sort()).toEqual([`receipts:${ids[0]}`, `receipts:${ids[1]}`].sort())
    const { held } = session.getState()
    expect(held!.receipts.get(ids[0]!)!.map((a) => a.id)).toEqual(small.attachments.filter((a) => a.transactionId === ids[0]).map((a) => a.id))
    session.loadReceipts([ids[0]!])
    await flush()
    expect(calls(source, 'receipts:')).toHaveLength(2)
  })

  it('reads nothing for a transaction that has no receipts', async () => {
    const { source, session } = await opened()
    const none = small.transactions.find((t) => !withCounts.includes(t.id))!
    session.loadReceipts([none.id])
    await flush()
    expect(calls(source, 'receipts:')).toEqual([])
  })

  it('reads many lists a few at a time and holds every one', async () => {
    const { session } = await opened()
    session.loadReceipts(ids)
    await flush()
    await flush()
    expect(session.getState().held!.receipts.size).toBe(ids.length)
    expect(session.getState().held!.attachmentCounts).toEqual(Object.fromEntries(ids.map((id) => [id, small.attachments.filter((a) => a.transactionId === id).length])))
  })

  it('reports a list that cannot be read and holds the others', async () => {
    const { source, session } = await opened()
    const read = source.readReceiptsPart.bind(source)
    source.readReceiptsPart = (id) => (id === ids[0] ? Promise.reject(new Error('offline')) : read(id))
    session.loadReceipts([ids[0]!])
    await flush()
    expect(session.getState().error).toBe('offline')
    expect(session.getState().held!.receipts.has(ids[0]!)).toBe(false)
    session.loadReceipts([ids[1]!])
    await flush()
    expect(session.getState().held!.receipts.has(ids[1]!)).toBe(true)
  })

  it('reads the whole list when a receipt is added to a transaction whose list was not read, and keeps the one added', async () => {
    const { source, session } = await opened()
    const id = ids[0]!
    const added = makeAttachment({ id: 9_001, transactionId: id })
    source.dataset = { ...small, attachments: [...small.attachments, added] }
    session.patch((d) => patchAfterAttachmentAdd(d, added))
    expect(session.getState().held!.receipts.get(id)!.map((a) => a.id)).toEqual([9_001])
    await flush()
    expect(calls(source, 'receipts:')).toEqual([`receipts:${id}`])
    const list = session.getState().held!.receipts.get(id)!.map((a) => a.id)
    expect(list).toEqual([...small.attachments.filter((a) => a.transactionId === id).map((a) => a.id), 9_001])
    expect(session.getState().held!.attachmentCounts[id]).toBe(list.length)
  })

  it('does nothing before the ledger is open', async () => {
    const source = memorySource(small)
    const session = new LedgerSession(source)
    session.loadReceipts([ids[0]!])
    await flush()
    expect(source.calls).toEqual([])
  })
})

describe('LedgerSession, a month that cannot be read', () => {
  it('reports the failure, stops hydrating and keeps what it holds, without rejecting', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    const before = session.getState().held
    source.readMonthsPart = () => Promise.reject(new Error('offline'))
    await expect(session.view(months[10]!)).resolves.toBeUndefined()
    const state = session.getState()
    expect(state.error).toBe('offline')
    expect(state.hydrating).toBe(false)
    expect(state.viewed).toBe(months[10])
    expect(state.held).toBe(before)
  })

  it('reports a failed full read after a write the same way, with hydrating on while it ran', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    session.patch((d) => ({ ...d, transactions: d.transactions.map((t, i) => (i === 0 ? { ...t, description: 'x' } : t)) }))
    source.readReferencePart = () => Promise.reject(new Error('down'))
    const seen: boolean[] = []
    session.subscribe(() => seen.push(session.getState().hydrating))
    await session.view(months[10]!)
    expect(seen).toContain(true)
    expect(session.getState().error).toBe('down')
    expect(session.getState().hydrating).toBe(false)
  })
})

describe('LedgerSession, writes', () => {
  it('shows a write at once, and reads again the sums of the months it moved', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    const old = months[3]!
    const added = row(900_002, old)
    const truth: ExpenseDataset = { ...dataset, transactions: [...dataset.transactions, added] }
    source.dataset = truth
    session.patch((d) => patchAfterTransactionCreate(d, added))
    expect(session.getState().held!.rowCount).toBe(dataset.transactions.length + 1)
    await flush()
    expect(calls(source, 'cube:')).toEqual([`cube:${old}..${old}`])
    const { held } = session.getState()
    expect(listsOf(ledgerOfHeld(held!))).toEqual(listsOf(buildLedger(truth, held!.rows.keys())))
    expect(held!.revision).toBe('r0')
  })

  it('reads no sums for a change to a month that is held', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    const target = [...session.getState().held!.rows.get(newest)!].find((t) => t.description !== '')!
    session.patch((d) => patchAfterTransactionUpdate(d, { ...target, description: 'Renamed' }))
    await flush()
    expect(source.calls).toEqual([])
    expect(session.getState().held!.rows.get(newest)!.find((t) => t.id === target.id)!.description).toBe('Renamed')
  })

  it('ignores a patch that changes nothing', async () => {
    const session = new LedgerSession(memorySource(dataset), { policy: WINDOWED })
    await session.open()
    const before = session.getState()
    session.patch((d) => structuredClone(d))
    expect(session.getState()).toBe(before)
  })

  it('reads sums for a change made while a read of them is on its way, and drops the old answer', async () => {
    const source = memorySource(dataset)
    const release = gated(source)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    const first = row(900_003, months[3]!)
    const second = row(900_004, months[4]!)
    let truth: ExpenseDataset = { ...dataset, transactions: [...dataset.transactions, first] }
    source.dataset = truth
    const open = release('cube')
    session.patch((d) => patchAfterTransactionCreate(d, first))
    await flush()
    truth = { ...truth, transactions: [...truth.transactions, second] }
    source.dataset = truth
    session.patch((d) => patchAfterTransactionCreate(d, second))
    open()
    await flush()
    await flush()
    const { held } = session.getState()
    expect(listsOf(ledgerOfHeld(held!))).toEqual(listsOf(buildLedger(truth, held!.rows.keys())))
  })

  it('never keeps sums read before a later write to the same month', async () => {
    const source = memorySource(dataset)
    const release = gated(source)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    const old = months[3]!
    const first = row(900_006, old, { amountCents: 1_111 })
    const second = row(900_007, old, { amountCents: 2_222 })
    let truth: ExpenseDataset = { ...dataset, transactions: [...dataset.transactions, first] }
    source.dataset = truth
    const open = release('cube')
    session.patch((d) => patchAfterTransactionCreate(d, first))
    await flush()
    truth = { ...truth, transactions: [...truth.transactions, second] }
    source.dataset = truth
    session.patch((d) => patchAfterTransactionCreate(d, second))
    open()
    await flush()
    await flush()
    const { held } = session.getState()
    expect(held!.cells!.filter((c) => c.budgetMonth === old)).toEqual(buildLedger(truth, []).cells.filter((c) => c.budgetMonth === old))
  })

  it('reports a failed read of sums and keeps what it holds', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.readCubePart = () => Promise.reject(new Error('offline'))
    session.patch((d) => patchAfterTransactionCreate(d, row(900_005, months[2]!)))
    await flush()
    expect(session.getState().error).toBe('offline')
    expect(session.getState().held!.rowCount).toBe(dataset.transactions.length + 1)
  })
})

describe('LedgerSession, a write the server answered with more than the patch shows', () => {
  it('reads the ledger again after a flag is deleted, and holds what the server holds', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    const flagged = session.getState().held!.pinned.find((t) => t.flagId != null)!
    const flagId = flagged.flagId!
    // The server unflags the rows, which stop being pinned; the old ones among them are summed instead.
    const truth: ExpenseDataset = {
      ...dataset,
      flags: dataset.flags.filter((f) => f.id !== flagId),
      transactions: dataset.transactions.map((t) => (t.flagId === flagId ? withoutFlag(t) : t)),
    }
    source.dataset = truth
    source.move('r5')
    source.calls.length = 0
    session.patch((d) => patchAfterFlagDelete(d, flagId))
    await flush()
    await flush()
    expect(calls(source, 'reference')).toHaveLength(1)
    const { held } = session.getState()
    expect(held!.revision).toBe('r5')
    expect(held!.pinned.some((t) => t.flagId === flagId)).toBe(false)
    expect(listsOf(ledgerOfHeld(held!))).toEqual(listsOf(buildLedger(truth, held!.rows.keys())))
  })

  it('reads the ledger again after a plan is added, to pick up the instalments the server inserted', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    session.patch((d) =>
      patchAfterInstallmentPlanCreate(d, {
        id: 9_001,
        description: 'Laptop',
        totalCount: 6,
        amountCents: 1_000,
        accountId: 1,
        categoryId: 1,
        type: 'expense',
        anchorBudgetMonth: newest,
        startInstallmentIndex: 1,
        active: true,
      }),
    )
    await flush()
    expect(calls(source, 'reference')).toHaveLength(1)
  })

  it('reads nothing again after a write the patch shows in full', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.calls.length = 0
    session.patch((d) => ({ ...d, settings: { ...d.settings, openingCashCents: 1 } }))
    await flush()
    expect(source.calls).toEqual([])
  })

  it('leaves no month waiting for sums once the whole read has brought them', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    // Deleting a flag unpins its rows, so the old months they sit in are summed and wait for sums.
    const flagId = session.getState().held!.pinned.find((t) => t.flagId != null && !session.getState().held!.rows.has(t.budgetMonth))!.flagId!
    let truth: ExpenseDataset = {
      ...dataset,
      flags: dataset.flags.filter((f) => f.id !== flagId),
      transactions: dataset.transactions.map((t) => (t.flagId === flagId ? withoutFlag(t) : t)),
    }
    source.dataset = truth
    session.patch((d) => patchAfterFlagDelete(d, flagId))
    await flush()
    await flush()
    const added = row(900_010, months[5]!)
    truth = { ...truth, transactions: [...truth.transactions, added] }
    source.dataset = truth
    source.calls.length = 0
    session.patch((d) => patchAfterTransactionCreate(d, added))
    await flush()
    expect(calls(source, 'cube:')).toEqual([`cube:${months[5]}..${months[5]}`])
  })
})

describe('LedgerSession, a refresh and a write at once', () => {
  async function opened() {
    const source = memorySource(dataset)
    const release = gated(source)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    return { source, release, session }
  }

  it('does not put the old rows back over a row written while it was reading, and ends with the written row', async () => {
    const { source, release, session } = await opened()
    const target = [...session.getState().held!.rows.get(newest)!].find((t) => t.amountCents > 0)!
    const seen: Array<string | undefined> = []
    const open = release('months')
    const refreshing = session.refresh()
    await flush()
    const renamed = { ...target, description: 'Renamed while reading' }
    source.dataset = { ...dataset, transactions: dataset.transactions.map((t) => (t.id === target.id ? renamed : t)) }
    session.patch((d) => patchAfterTransactionUpdate(d, renamed))
    session.subscribe(() =>
      seen.push(session.getState().held!.rows.get(newest)?.find((t) => t.id === target.id)?.description),
    )
    open()
    await refreshing
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((description) => description === 'Renamed while reading')).toBe(true)
    const { held } = session.getState()
    expect(held!.rows.get(newest)!.find((t) => t.id === target.id)!.description).toBe('Renamed while reading')
    expect(held!.revision).toBe('r0')
  })

  it('does not put the old settings back over a setting written while it was reading', async () => {
    const { source, release, session } = await opened()
    const seen: number[] = []
    const open = release('reference')
    const refreshing = session.refresh()
    await flush()
    // The write reached the server first, as it does before the screens patch it in.
    source.dataset = { ...dataset, settings: { ...dataset.settings, openingCashCents: 4242 } }
    session.patch((d) => ({ ...d, settings: { ...d.settings, openingCashCents: 4242 } }))
    session.subscribe(() => seen.push(session.getState().held!.reference.settings.openingCashCents))
    open()
    await refreshing
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((cents) => cents === 4242)).toBe(true)
    expect(session.getState().held!.reference.settings.openingCashCents).toBe(4242)
  })

  it('takes what a refresh read when nothing was written meanwhile', async () => {
    const source = memorySource(dataset)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    source.move('r7')
    source.dataset = { ...dataset, transactions: dataset.transactions.slice(1) }
    await session.refresh()
    expect(session.getState().held!.revision).toBe('r7')
    expect(session.getState().held!.rowCount).toBe(dataset.transactions.length - 1)
  })
})

describe('LedgerSession, an empty ledger', () => {
  it('opens with nothing held and no month', async () => {
    const empty: ExpenseDataset = { ...dataset, transactions: [] }
    const session = new LedgerSession(memorySource(empty))
    await session.open()
    expect(session.getState().held!.months).toEqual([])
    expect(session.getState().viewed).toBe('')
  })
})
