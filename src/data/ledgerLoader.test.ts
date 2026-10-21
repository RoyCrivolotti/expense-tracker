import { describe, expect, it } from 'vitest'
import { LedgerChangedError, PartTooLargeError } from '../domain/data/ledgerPartsErrors'
import {
  HYDRATED_DATA_MONTHS,
  type HydrationPolicy,
  assembleRows,
  ledgerFor,
  ledgerMonths,
  ledgerRowCount,
} from '../domain/ledger'
import { sortedMonths } from '../domain/engine/dates'
import type { ExpenseDataset } from '../domain/types'
import { adversarialLedger } from '../testing/adversarialLedger'
import { makeDataset, makeTransaction } from '../testing/factories'
import { comparable, memorySource } from '../testing/ledgerSource'
import { randomLedger } from '../testing/randomLedger'
import { syntheticLedger } from '../testing/syntheticLedger'
import { loadLedger } from './ledgerLoader'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }

/** What the engines are handed from a ledger, with the order of label ids settled. */
function listsOf(ledger: Parameters<typeof assembleRows>[0]) {
  const { real, linear } = assembleRows(ledger)
  return { real: comparable(real), linear: comparable(linear) }
}

/** The ledger read in parts holds what `ledgerFor` makes of the whole dataset. */
async function expectSameAsWhole(dataset: ExpenseDataset, viewed: string, policy?: HydrationPolicy) {
  const loaded = await loadLedger(memorySource(dataset), { viewed, ...(policy ? { policy } : {}) })
  const whole = ledgerFor(dataset, viewed, policy)
  expect(listsOf(loaded.ledger)).toEqual(listsOf(whole))
  expect(ledgerMonths(loaded.ledger)).toEqual(ledgerMonths(whole))
  expect(ledgerRowCount(loaded.ledger)).toBe(ledgerRowCount(whole))
  expect(loaded.ledger.hydratedMonths).toEqual(whole.hydratedMonths)
  expect(loaded.ledger.cells).toEqual(whole.cells)
  expect(loaded.ledger.reference).toEqual({ ...whole.reference, attachments: [] })
  expect(loaded.rowCount).toBe(dataset.transactions.length)
}

describe('loadLedger, compared with the whole dataset', () => {
  const synthetic = syntheticLedger({ months: 40, perMonth: 30, seed: 3 })
  const adversarial = adversarialLedger()
  const months = sortedMonths(adversarial.transactions.map((t) => t.budgetMonth))

  it('holds every month as real rows for a ledger under the size policy, with no sums', async () => {
    const loaded = await loadLedger(memorySource(synthetic))
    expect(loaded.ledger.cells).toEqual([])
    expect(loaded.ledger.hydratedMonths).toEqual(sortedMonths(synthetic.transactions.map((t) => t.budgetMonth)))
    await expectSameAsWhole(synthetic, '2026-01')
  })

  it('opens on the newest month with data when no month is given', async () => {
    const source = memorySource(adversarial)
    const loaded = await loadLedger(source, { policy: WINDOWED })
    expect(loaded.ledger.hydratedMonths).toEqual(ledgerFor(adversarial, months.at(-1)!, WINDOWED).hydratedMonths)
  })

  it('holds a window of months and sums of the rest when the policy asks for it, for every viewed month', async () => {
    for (const month of months) await expectSameAsWhole(adversarial, month, WINDOWED)
  })

  it('does the same for a viewed month after the data, and one before it', async () => {
    await expectSameAsWhole(adversarial, '2031-01', WINDOWED)
    await expectSameAsWhole(adversarial, '2010-01', WINDOWED)
  })

  it('does the same for random ledgers, with and without a window', async () => {
    for (let seed = 1; seed <= 25; seed++) {
      const dataset = randomLedger(seed)
      const list = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
      for (const viewed of [list[0] ?? '2026-01', list[Math.floor(list.length / 2)] ?? '2026-01', list.at(-1) ?? '2026-01']) {
        await expectSameAsWhole(dataset, viewed)
        await expectSameAsWhole(dataset, viewed, WINDOWED)
        await expectSameAsWhole(dataset, viewed, { fullBelowRows: 0, dataMonths: 2 })
      }
    }
  })

  it('reads an empty ledger', async () => {
    const loaded = await loadLedger(memorySource(makeDataset()))
    expect(loaded.ledger.hydrated).toEqual([])
    expect(loaded.ledger.cells).toEqual([])
    expect(loaded.rowCount).toBe(0)
  })

  it('counts receipts of the pinned rows and of the rows it holds', async () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ id: 1, date: '2026-01-10', budgetMonth: '2026-01' }),
        makeTransaction({ id: 2, date: '2026-02-10', budgetMonth: '2026-02', flagId: 1 }),
        makeTransaction({ id: 3, date: '2026-03-10', budgetMonth: '2026-03' }),
      ],
      attachments: [
        { id: 1, transactionId: 1, contentType: 'image/jpeg', byteSize: 1, createdAt: 'x', hasThumb: true },
        { id: 2, transactionId: 2, contentType: 'image/jpeg', byteSize: 1, createdAt: 'x', hasThumb: true },
        { id: 3, transactionId: 2, contentType: 'image/jpeg', byteSize: 1, createdAt: 'x', hasThumb: true },
      ],
    })
    const loaded = await loadLedger(memorySource(dataset), { viewed: '2026-03', policy: { fullBelowRows: 0, dataMonths: 1 } })
    expect(loaded.attachmentCounts).toEqual({ 2: 2 })
    const full = await loadLedger(memorySource(dataset))
    expect(full.attachmentCounts).toEqual({ 1: 1, 2: 2 })
  })
})

describe('loadLedger, requests', () => {
  const dataset = adversarialLedger()

  it('reads the reference, then one rows request and nothing else for a ledger it holds in full', async () => {
    const source = memorySource(syntheticLedger({ months: 12, perMonth: 20, seed: 1 }))
    await loadLedger(source)
    expect(source.calls).toHaveLength(2)
    expect(source.calls[0]).toBe('reference')
    expect(source.calls[1]).toMatch(/^months:/)
  })

  it('asks for the sums of every month and the rows of the window when it is windowed', async () => {
    const source = memorySource(dataset)
    await loadLedger(source, { policy: WINDOWED })
    expect(source.calls.filter((call) => call.startsWith('cube:'))).toHaveLength(1)
    expect(source.calls.filter((call) => call.startsWith('months:'))).toHaveLength(1)
  })
})

describe('loadLedger, when the ledger moves while it is read', () => {
  const dataset = syntheticLedger({ months: 12, perMonth: 10, seed: 2 })
  const calls = (source: { calls: string[] }, prefix: string) => source.calls.filter((c) => c.startsWith(prefix))

  it('reads the reference again and keeps the parts that already carry its revision', async () => {
    const source = memorySource(dataset)
    // A write lands after the reference is read and before the rows are.
    source.before = (call) => {
      if (call.startsWith('months:') && calls(source, 'reference').length === 1) source.move('r1')
    }
    const loaded = await loadLedger(source)
    expect(loaded.revision).toBe('r1')
    expect(calls(source, 'reference')).toHaveLength(2)
    expect(calls(source, 'months:')).toHaveLength(1)
  })

  it('reads again the part that carries the old revision and keeps the one that carries the new', async () => {
    const source = memorySource(dataset)
    // The rows are read under r0; the ledger moves while the sums are being read.
    source.before = (call) => {
      if (call.startsWith('cube:') && source.revision === 'r0') source.move('r1')
    }
    const loaded = await loadLedger(source, { policy: { fullBelowRows: 0, dataMonths: 3 } })
    expect(loaded.revision).toBe('r1')
    expect(calls(source, 'months:')).toHaveLength(2)
    expect(calls(source, 'cube:')).toHaveLength(1)
  })

  it('reads the sums again when they carry the old revision and the rows the new', async () => {
    const source = memorySource(dataset)
    // The sums are served at once under r0; the rows are slow, and the ledger moves before they are read.
    const slowRows = source.readMonthsPart.bind(source)
    source.readMonthsPart = async (range) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return slowRows(range)
    }
    source.before = (call) => {
      if (call.startsWith('cube:') && source.revision === 'r0') setTimeout(() => source.move('r1'), 1)
    }
    const loaded = await loadLedger(source, { policy: { fullBelowRows: 0, dataMonths: 3 } })
    expect(loaded.revision).toBe('r1')
    expect(calls(source, 'months:')).toHaveLength(1)
    expect(calls(source, 'cube:')).toHaveLength(2)
  })

  it('gives up with a clear error when it moves on every attempt', async () => {
    const source = memorySource(dataset)
    source.before = () => source.move()
    await expect(loadLedger(source, { maxAttempts: 3 })).rejects.toBeInstanceOf(LedgerChangedError)
    expect(calls(source, 'reference')).toHaveLength(3)
  })

  it('plans from the new reference, so a month a write added is read', async () => {
    const source = memorySource(dataset)
    const added = makeTransaction({ id: 99_999, date: '2031-05-10', budgetMonth: '2031-05' })
    source.before = (call) => {
      if (call.startsWith('months:') && source.revision === 'r0') {
        source.dataset = { ...dataset, transactions: [...dataset.transactions, added] }
        source.move('r1')
      }
    }
    const loaded = await loadLedger(source)
    expect(loaded.rowCount).toBe(dataset.transactions.length + 1)
    expect(loaded.ledger.hydrated.map((row) => row.id)).toContain(99_999)
  })
})

describe('loadLedger, when the sums are too many for one request', () => {
  it('asks for the halves of a range the server refuses, down to what it serves', async () => {
    const dataset = adversarialLedger()
    const source = memorySource(dataset)
    const read = source.readCubePart.bind(source)
    source.readCubePart = async (range) => {
      const months = Number(range.to.slice(0, 4)) * 12 + Number(range.to.slice(5)) - (Number(range.from.slice(0, 4)) * 12 + Number(range.from.slice(5)))
      if (months > 15) throw new PartTooLargeError('too many cells')
      return read(range)
    }
    const loaded = await loadLedger(source, { policy: WINDOWED, viewed: '2026-08' })
    const whole = ledgerFor(dataset, '2026-08', WINDOWED)
    expect(listsOf(loaded.ledger)).toEqual(listsOf(whole))
  })

  it('gives up when even one month is too much', async () => {
    const source = memorySource(adversarialLedger())
    source.readCubePart = () => Promise.reject(new PartTooLargeError('too many cells'))
    await expect(loadLedger(source, { policy: WINDOWED })).rejects.toBeInstanceOf(PartTooLargeError)
  })

  it('does not hide an error that is not about size', async () => {
    const source = memorySource(adversarialLedger())
    source.readCubePart = () => Promise.reject(new Error('network'))
    await expect(loadLedger(source, { policy: WINDOWED })).rejects.toThrow('network')
  })
})
