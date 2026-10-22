import { describe, expect, it } from 'vitest'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, assembleRows, buildLedger, ledgerFor } from '../domain/ledger'
import type { Ledger } from '../domain/ledger'
import { sortedMonths } from '../domain/engine/dates'
import { adversarialLedger } from '../testing/adversarialLedger'
import { comparable, memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import {
  evictMonths,
  holdCells,
  holdParts,
  holdReference,
  holdRows,
  ledgerOfHeld,
  missingMonths,
  touchMonths,
  wantedMonths,
} from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const dataset = adversarialLedger()
const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))

function listsOf(ledger: Ledger) {
  const { real, linear } = assembleRows(ledger)
  return { real: comparable(real), linear: comparable(linear) }
}

/** What the held rows and sums are worth: the same lists `buildLedger` makes for the months held. */
const expected = (months: Iterable<string>) => listsOf(buildLedger(dataset, months))

async function windowAround(viewed: string) {
  const source = memorySource(dataset)
  const parts = await readLedgerParts(source, { viewed, policy: WINDOWED })
  return { source, held: holdParts(parts) }
}

describe('holdParts', () => {
  it('holds the rows of the window and the sums of every month', async () => {
    const { held } = await windowAround(months[30]!)
    expect(held.rows.size).toBe(HYDRATED_DATA_MONTHS)
    expect(held.cells).not.toBeNull()
    expect(held.cells!.map((c) => c.budgetMonth).sort()).toContain(months[0])
    expect(held.revision).toBe('r0')
    expect(listsOf(ledgerOfHeld(held))).toEqual(expected(held.rows.keys()))
  })

  it('holds every month and no sums for a ledger under the size policy', async () => {
    const small = syntheticLedger({ months: 12, perMonth: 10, seed: 1 })
    const held = holdParts(await readLedgerParts(memorySource(small)))
    expect(held.cells).toBeNull()
    expect(held.rows.size).toBe(held.months.length)
    expect(held.rowCount).toBe(small.transactions.length)
  })

  it('counts the receipts of the pinned rows and of the rows it holds', async () => {
    const withReceipts = {
      ...dataset,
      attachments: [{ id: 1, transactionId: dataset.transactions[0]!.id, contentType: 'image/jpeg', byteSize: 1, createdAt: 'x', hasThumb: true }],
    }
    const held = holdParts(await readLedgerParts(memorySource(withReceipts)))
    expect(held.attachmentCounts).toEqual({ [dataset.transactions[0]!.id]: 1 })
  })
})

describe('wantedMonths', () => {
  it('is the window around the viewed month and the newest window', async () => {
    const { held } = await windowAround(months[10]!)
    const wanted = wantedMonths(held, months[10]!)
    expect(wanted).toContain(months[10])
    expect(wanted).toContain(months.at(-1))
    expect(wanted.length).toBeLessThanOrEqual(2 * HYDRATED_DATA_MONTHS)
    expect(wanted).toEqual(sortedMonths(wanted))
  })

  it('is the newest window alone when the newest month is viewed', async () => {
    const { held } = await windowAround(months.at(-1)!)
    expect(wantedMonths(held, months.at(-1)!)).toHaveLength(HYDRATED_DATA_MONTHS)
  })

  it('is every month for a ledger held in full', async () => {
    const held = holdParts(await readLedgerParts(memorySource(syntheticLedger({ months: 12, perMonth: 10, seed: 1 }))))
    expect(wantedMonths(held, '2000-01')).toEqual(held.months)
  })
})

describe('holding more months', () => {
  it('reads the months that are missing and ends up with what buildLedger makes for the months held', async () => {
    const { source, held } = await windowAround(months.at(-1)!)
    const wanted = wantedMonths(held, months[5]!)
    const missing = missingMonths(held, wanted)
    expect(missing.length).toBeGreaterThan(0)
    const part = await source.readMonthsPart({ from: missing[0]!, to: missing.at(-1)! })
    const next = holdRows(held, [part])
    expect(listsOf(ledgerOfHeld(next))).toEqual(expected(next.rows.keys()))
    expect(missingMonths(next, wanted).filter((m) => m >= missing[0]! && m <= missing.at(-1)!)).toEqual([])
  })

  it('replaces a month it already holds, with the newer rows', async () => {
    const { source, held } = await windowAround(months.at(-1)!)
    const month = months.at(-1)!
    const part = await source.readMonthsPart({ from: month, to: month })
    const next = holdRows(held, [{ ...part, transactions: part.transactions.slice(1) }])
    expect(next.rows.get(month)).toHaveLength((held.rows.get(month)?.length ?? 0) - 1)
  })
})

describe('giving months up again', () => {
  it('drops the least recently used month that is not kept, and no more than needed', async () => {
    const { held } = await windowAround(months.at(-1)!)
    const keep = [...held.rows.keys()].slice(-3)
    const next = evictMonths(held, keep, 8)
    expect(next.rows.size).toBe(8)
    for (const month of keep) expect(next.rows.has(month)).toBe(true)
    expect([...next.rows.keys()]).toEqual([...held.rows.keys()].filter((m) => next.rows.has(m)))
    expect(listsOf(ledgerOfHeld(next))).toEqual(expected(next.rows.keys()))
  })

  it('treats a month just used as the last to go', async () => {
    const { held } = await windowAround(months.at(-1)!)
    const first = [...held.rows.keys()][0]!
    const used = touchMonths(held, [first])
    expect([...used.rows.keys()].at(-1)).toBe(first)
    const next = evictMonths(used, [], held.rows.size - 1)
    expect(next.rows.has(first)).toBe(true)
  })

  it('keeps a month it was told to keep even past the cap', async () => {
    const { held } = await windowAround(months.at(-1)!)
    expect(evictMonths(held, held.rows.keys(), 2).rows.size).toBe(held.rows.size)
  })

  it('gives nothing up for a ledger held in full', async () => {
    const held = holdParts(await readLedgerParts(memorySource(syntheticLedger({ months: 12, perMonth: 10, seed: 1 }))))
    expect(evictMonths(held, [], 2)).toBe(held)
  })
})

describe('holding sums and a reference again', () => {
  it('replaces the sums of the months a part covers and keeps the others', async () => {
    const { source, held } = await windowAround(months.at(-1)!)
    const part = await source.readCubePart({ from: months[3]!, to: months[4]! })
    const bent = { ...part, cells: part.cells.map((c) => ({ ...c, amountCents: c.amountCents + 1 })) }
    const next = holdCells(held, [bent])
    const changed = next.cells!.filter((c) => c.budgetMonth === months[3])
    expect(changed.every((c, i) => c.amountCents === part.cells.filter((x) => x.budgetMonth === months[3])[i]!.amountCents + 1)).toBe(true)
    expect(next.cells!.filter((c) => c.budgetMonth === months[10])).toEqual(held.cells!.filter((c) => c.budgetMonth === months[10]))
    expect(next.cells!.map((c) => c.budgetMonth)).toEqual([...next.cells!.map((c) => c.budgetMonth)].sort())
  })

  it('takes the tables, the index of months and the counts from a new reference', async () => {
    const { source, held } = await windowAround(months.at(-1)!)
    const part = await source.readReferencePart()
    const next = holdReference(held, { ...part, rowCount: part.rowCount + 5, months: [...part.months, '2031-01'] })
    expect(next.rowCount).toBe(held.rowCount + 5)
    expect(next.months.at(-1)).toBe('2031-01')
    expect(next.reference).toBe(part.reference)
  })
})

describe('the ledger a held window makes', () => {
  it('is the ledger ledgerFor makes for the same months', async () => {
    for (const viewed of [months[2]!, months[25]!, months.at(-1)!]) {
      const { held } = await windowAround(viewed)
      expect(listsOf(ledgerOfHeld(held))).toEqual(listsOf(ledgerFor(dataset, viewed, WINDOWED)))
    }
  })
})
