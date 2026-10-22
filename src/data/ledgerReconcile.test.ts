import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../domain/engine/rng'
import { ledgerReferenceOf } from '../domain/ledger/partsOfDataset'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, assembleRows, buildLedger, partitionPinned } from '../domain/ledger'
import type { Ledger } from '../domain/ledger'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { sortedMonths } from '../domain/engine/dates'
import {
  patchAfterAttachmentAdd,
  patchAfterAttachmentDelete,
  patchAfterFlagDelete,
  patchAfterTransactionCreate,
  patchAfterTransactionDelete,
  patchAfterTransactionUpdate,
} from '../ui/datasetPatches'
import { adversarialLedger } from '../testing/adversarialLedger'
import { makeAttachment, makeDataset, makeTransaction } from '../testing/factories'
import { comparable, memorySource } from '../testing/ledgerSource'
import { randomLedger } from '../testing/randomLedger'
import { syntheticLedger } from '../testing/syntheticLedger'
import { type HeldLedger, holdCells, holdParts, holdReceipts } from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'
import { datasetOfHeld, reconcileHeld } from './ledgerReconcile'
import { inMemoryLedgerParts } from './inMemoryLedgerParts'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }

function listsOf(ledger: Ledger) {
  const { real, linear } = assembleRows(ledger)
  return { real: comparable(real), linear: comparable(linear) }
}

async function hold(dataset: ExpenseDataset, viewed: string, policy?: HydrationPolicy): Promise<HeldLedger> {
  return holdParts(await readLedgerParts(memorySource(dataset), { viewed, ...(policy ? { policy } : {}) }))
}

/** Reads the sums of the stale months from the truth, as the caller reads them from the server. */
async function refetch(held: HeldLedger, stale: string[], truth: ExpenseDataset): Promise<HeldLedger> {
  const source = inMemoryLedgerParts(() => ({ dataset: truth, revision: 't' }))
  const parts = await Promise.all(stale.map((month) => source.readCubePart({ from: month, to: month })))
  return holdCells(held, parts)
}

/**
 * The invariant: patching what is held and then reading the stale months again leaves exactly what a
 * client that had read the patched ledger afresh would hold, for the months it holds as rows.
 */
async function expectTruth(next: HeldLedger, truth: ExpenseDataset) {
  const reference = ledgerReferenceOf(truth)
  expect(next.months).toEqual(reference.months)
  expect(next.rowsPerMonth).toEqual(reference.rowsPerMonth)
  expect(next.rowCount).toBe(reference.rowCount)
  expect(comparable(next.pinned)).toEqual(comparable(reference.pinned))
  const held = [...next.rows.keys()]
  const { ledgerOfHeld } = await import('./ledgerHold')
  expect(listsOf(ledgerOfHeld(next))).toEqual(listsOf(buildLedger(truth, held)))
}

async function apply(held: HeldLedger, truth: ExpenseDataset, patch: (d: ExpenseDataset) => ExpenseDataset, viewed: string) {
  const before = datasetOfHeld(held)
  const after = patch(before)
  const reconciled = reconcileHeld(held, before, after, viewed)
  const patchedTruth = patch(truth)
  const next = reconciled.held.cells === null ? reconciled.held : await refetch(reconciled.held, reconciled.stale, patchedTruth)
  return { ...reconciled, next, truth: patchedTruth }
}

const row = (id: number, month: string, over: Partial<Transaction> = {}) =>
  makeTransaction({ id, date: `${month}-12`, budgetMonth: month, description: `New ${id}`, ...over })

describe('reconcileHeld, for one change at a time', () => {
  const dataset = adversarialLedger()
  const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
  const newest = months.at(-1)!

  it('answers nothing changed for a patch that changes nothing', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const before = datasetOfHeld(held)
    const reconciled = reconcileHeld(held, before, structuredClone(before), newest)
    expect(reconciled.held).toBe(held)
    expect(reconciled.changed).toEqual({ reference: false, rows: false, receipts: false })
    expect(reconciled.stale).toEqual([])
  })

  it('patches a row in a held month at once and leaves the sums alone', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const target = held.rows.get(newest)!.find((t) => !partitionPinned([t]).pinned.length)!
    const { next, stale, truth } = await apply(held, dataset, (d) => patchAfterTransactionUpdate(d, { ...target, description: 'Renamed' }), newest)
    expect(stale).toEqual([])
    expect(next.revision).toBeNull()
    await expectTruth(next, truth)
  })

  it('marks the month of an unpinned row whose amount changed as stale, even when it is held', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const target = held.rows.get(newest)!.find((t) => !partitionPinned([t]).pinned.length && t.amountCents !== 0)!
    const { stale, next, truth } = await apply(held, dataset, (d) => patchAfterTransactionUpdate(d, { ...target, amountCents: target.amountCents + 100 }), newest)
    expect(stale).toEqual([newest])
    await expectTruth(next, truth)
  })

  it('adds a row to a held month and counts it', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const { next, truth } = await apply(held, dataset, (d) => patchAfterTransactionCreate(d, row(900_001, newest)), newest)
    expect(next.rowCount).toBe(held.rowCount + 1)
    expect(next.rowsPerMonth[newest]).toBe((held.rowsPerMonth[newest] ?? 0) + 1)
    await expectTruth(next, truth)
  })

  it('holds a month that did not exist, as the newest window now includes it', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const { next, truth, stale } = await apply(held, dataset, (d) => patchAfterTransactionCreate(d, row(900_002, '2031-02')), newest)
    expect(next.rows.has('2031-02')).toBe(true)
    expect(next.months.at(-1)).toBe('2031-02')
    expect(stale).toEqual(['2031-02'])
    await expectTruth(next, truth)
  })

  it('drops a row added to a month that is not held and reads that month’s sums again', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const old = months[3]!
    const { next, stale, truth } = await apply(held, dataset, (d) => patchAfterTransactionCreate(d, row(900_003, old)), newest)
    expect(stale).toEqual([old])
    expect(next.rows.has(old)).toBe(false)
    expect(next.rowsPerMonth[old]).toBe((held.rowsPerMonth[old] ?? 0) + 1)
    await expectTruth(next, truth)
  })

  it('removes a deleted row and its receipt count, and a month with no row left', async () => {
    const small = { ...dataset, transactions: [...dataset.transactions, row(900_004, '2031-03')] }
    const held = await hold(small, '2031-03', WINDOWED)
    const { next, truth } = await apply(held, small, (d) => patchAfterTransactionDelete(d, 900_004), '2031-03')
    expect(next.months).not.toContain('2031-03')
    expect(next.rowCount).toBe(held.rowCount - 1)
    await expectTruth(next, truth)
  })

  it('moves a row between months', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const target = held.rows.get(newest)!.find((t) => !partitionPinned([t]).pinned.length)!
    const to = months.at(-2)!
    const { next, truth, stale } = await apply(held, dataset, (d) => patchAfterTransactionUpdate(d, { ...target, budgetMonth: to, date: `${to}-10` }), newest)
    expect(stale.sort()).toEqual([to, newest].sort())
    await expectTruth(next, truth)
  })

  it('treats a row that stops being pinned in a month that is not held as summed, and reads the month again', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const flaggedOld = held.pinned.find((t) => t.flagId != null && !held.rows.has(t.budgetMonth))
    expect(flaggedOld).toBeDefined()
    const { next, stale, truth } = await apply(held, dataset, (d) => patchAfterFlagDelete(d, flaggedOld!.flagId!), newest)
    expect(stale).toContain(flaggedOld!.budgetMonth)
    await expectTruth(next, truth)
  })

  it('marks a reference change and keeps the rows', async () => {
    const held = await hold(dataset, newest, WINDOWED)
    const before = datasetOfHeld(held)
    const after = { ...before, settings: { ...before.settings, openingCashCents: 7 } }
    const reconciled = reconcileHeld(held, before, after, newest)
    expect(reconciled.changed).toEqual({ reference: true, rows: false, receipts: false })
    expect(reconciled.held.reference.settings.openingCashCents).toBe(7)
    expect(reconciled.held.rows).toEqual(held.rows)
    expect(reconciled.held.revision).toBeNull()
  })

  it('holds a ledger in full with no sums to read again', async () => {
    const small = syntheticLedger({ months: 12, perMonth: 10, seed: 1 })
    const viewed = sortedMonths(small.transactions.map((t) => t.budgetMonth)).at(-1)!
    const held = await hold(small, viewed)
    const { next, stale, truth } = await apply(held, small, (d) => patchAfterTransactionCreate(d, row(900_005, '2020-01')), viewed)
    expect(stale).toEqual([])
    expect(next.rows.has('2020-01')).toBe(true)
    await expectTruth(next, truth)
  })
})

describe('reconcileHeld, for sequences of changes', () => {
  it('leaves what a fresh read of the patched ledger would hold, for random ledgers and random patches', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const dataset = randomLedger(seed)
      const list = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
      if (list.length < 3) continue
      const rnd = mulberry32(seed)
      const viewed = list[Math.floor(rnd() * list.length)]!
      let held = await hold(dataset, viewed, { fullBelowRows: 0, dataMonths: 3 })
      let truth = dataset
      let nextId = 1_000_000
      for (let step = 0; step < 12; step++) {
        const kind = Math.floor(rnd() * 4)
        const month = list[Math.floor(rnd() * list.length)]!
        const current = datasetOfHeld(held).transactions
        const target = current[Math.floor(rnd() * current.length)]
        const patch = (d: ExpenseDataset): ExpenseDataset => {
          if (kind === 0 || !target) return patchAfterTransactionCreate(d, row(nextId, month, { amountCents: 100 + step }))
          if (kind === 1) return patchAfterTransactionUpdate(d, { ...target, amountCents: target.amountCents + 7 })
          if (kind === 2) return patchAfterTransactionDelete(d, target.id)
          return patchAfterTransactionUpdate(d, { ...target, budgetMonth: month, date: `${month}-09` })
        }
        const done = await apply(held, truth, patch, viewed)
        nextId += 1
        held = done.next
        truth = done.truth
        await expectTruth(held, truth)
      }
    }
  }, 60_000)
})

describe('reconcileHeld, receipts', () => {
  const withReceipts: ExpenseDataset = makeDataset({
    transactions: [row(1, '2026-01'), row(2, '2026-01'), row(3, '2026-02')],
    attachments: [makeAttachment({ id: 1, transactionId: 1 }), makeAttachment({ id: 2, transactionId: 1 }), makeAttachment({ id: 3, transactionId: 2 })],
  })

  async function loaded(read: number[]) {
    let held = await hold(withReceipts, '2026-02')
    for (const id of read) {
      const list = withReceipts.attachments.filter((a) => a.transactionId === id)
      held = holdReceipts(held, id, list)
    }
    return held
  }

  it('holds a receipt added to a transaction whose list was read, and counts it', async () => {
    const held = await loaded([1])
    const added = makeAttachment({ id: 9, transactionId: 1 })
    const done = reconcileHeld(held, datasetOfHeld(held), patchAfterAttachmentAdd(datasetOfHeld(held), added), '2026-02')
    expect(done.changed.receipts).toBe(true)
    expect(done.held.receipts.get(1)!.map((a) => a.id)).toEqual([1, 2, 9])
    expect(done.held.attachmentCounts[1]).toBe(3)
    expect(done.partialReceipts).toEqual([])
  })

  it('says the list is partial when a receipt is added before the transaction’s list was read', async () => {
    const held = await loaded([])
    const added = makeAttachment({ id: 9, transactionId: 1 })
    const done = reconcileHeld(held, datasetOfHeld(held), patchAfterAttachmentAdd(datasetOfHeld(held), added), '2026-02')
    expect(done.partialReceipts).toEqual([1])
    expect(done.held.receipts.get(1)!.map((a) => a.id)).toEqual([9])
  })

  it('drops a deleted receipt and the count when it was the last', async () => {
    const held = await loaded([1, 2])
    const before = datasetOfHeld(held)
    const once = reconcileHeld(held, before, patchAfterAttachmentDelete(before, 3), '2026-02')
    expect(once.held.receipts.get(2)).toEqual([])
    expect(once.held.attachmentCounts[2]).toBeUndefined()
    const twice = reconcileHeld(once.held, datasetOfHeld(once.held), patchAfterAttachmentDelete(datasetOfHeld(once.held), 1), '2026-02')
    expect(twice.held.attachmentCounts[1]).toBe(1)
  })

  it('forgets the receipts of a deleted transaction', async () => {
    const held = await loaded([1, 2])
    const before = datasetOfHeld(held)
    const done = reconcileHeld(held, before, patchAfterTransactionDelete(before, 1), '2026-02')
    expect(done.held.receipts.has(1)).toBe(false)
    expect(done.held.attachmentCounts[1]).toBeUndefined()
    expect(done.held.receipts.get(2)).toHaveLength(1)
  })
})
