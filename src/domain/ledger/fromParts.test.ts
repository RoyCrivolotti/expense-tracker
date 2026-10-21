import { describe, expect, it } from 'vitest'
import type { CubePart, MonthRowsPart, ReferencePart } from '../data/ledgerParts'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { assembleRows } from './assemble'
import { buildLedger } from './build'
import { ledgerFromParts } from './fromParts'
import { ledgerReferenceOf } from './partsOfDataset'

const row = (id: number, month: string, over: Parameters<typeof makeTransaction>[0] = {}) =>
  makeTransaction({ id, date: `${month}-10`, budgetMonth: month, ...over })

const dataset = makeDataset({
  transactions: [
    row(1, '2026-01'),
    row(2, '2026-01', { type: 'investment' }),
    row(3, '2026-02'),
    row(4, '2026-03'),
    row(5, '2026-04'),
  ],
})
const reference: ReferencePart = { revision: 'v1', ...ledgerReferenceOf(dataset) }
const rows = (from: string, to: string, ids: number[], counts = {}): MonthRowsPart => ({
  revision: 'v1',
  from,
  to,
  transactions: dataset.transactions.filter((t) => ids.includes(t.id)).reverse(),
  attachmentCounts: counts,
})
const cube = (from: string, to: string): CubePart => ({
  revision: 'v1',
  from,
  to,
  cells: [
    { budgetMonth: '2026-01', accountId: 1, categoryId: 1, type: 'expense', cancelled: false, sign: 1, amountCents: 1, count: 1 },
    { budgetMonth: '2026-02', accountId: 1, categoryId: 1, type: 'expense', cancelled: false, sign: 1, amountCents: 2, count: 1 },
    { budgetMonth: '2026-03', accountId: 1, categoryId: 1, type: 'expense', cancelled: false, sign: 1, amountCents: 3, count: 1 },
  ],
})

describe('ledgerFromParts', () => {
  it('takes the months held as rows from the ranges that were read', () => {
    const { ledger } = ledgerFromParts({ reference, rows: [rows('2026-03', '2026-04', [4, 5])], cube: [] })
    expect(ledger.hydratedMonths).toEqual(['2026-03', '2026-04'])
  })

  it('counts a month with data inside a range it was not asked for as held, because its rows came back', () => {
    const { ledger } = ledgerFromParts({ reference, rows: [rows('2026-02', '2026-04', [3, 4, 5])], cube: [] })
    expect(ledger.hydratedMonths).toEqual(['2026-02', '2026-03', '2026-04'])
  })

  it('leaves out the sums of a month it holds as rows, and keeps the rest', () => {
    const { ledger } = ledgerFromParts({
      reference,
      rows: [rows('2026-03', '2026-04', [4, 5])],
      cube: [cube('2026-01', '2026-04')],
    })
    expect(ledger.cells.map((cell) => cell.budgetMonth)).toEqual(['2026-01', '2026-02'])
  })

  it('puts the rows of several ranges together, once each', () => {
    const { ledger } = ledgerFromParts({
      reference,
      rows: [rows('2026-01', '2026-02', [1, 2, 3]), rows('2026-03', '2026-04', [4, 5])],
      cube: [],
    })
    expect(ledger.hydrated.map((t) => t.id).sort()).toEqual([1, 2, 3, 4, 5])
    const twice = ledgerFromParts({
      reference,
      rows: [rows('2026-01', '2026-02', [1, 2, 3]), rows('2026-02', '2026-03', [3, 4])],
      cube: [],
    })
    expect(twice.ledger.hydrated.map((t) => t.id).sort()).toEqual([1, 2, 3, 4])
  })

  it('keeps the pinned rows as the reference sent them and has no receipt list of its own', () => {
    const { ledger } = ledgerFromParts({ reference, rows: [], cube: [] })
    expect(ledger.pinned.map((t) => t.id)).toEqual([2])
    expect(ledger.reference.attachments).toEqual([])
    expect(ledger.reference.categories).toEqual(dataset.categories)
  })

  it('adds the receipt counts of the reference and of every rows part', () => {
    const { attachmentCounts } = ledgerFromParts({
      reference: { ...reference, attachmentCounts: { 2: 1 } },
      rows: [rows('2026-01', '2026-02', [1, 3], { 1: 2 }), rows('2026-03', '2026-04', [4, 5], { 4: 1 })],
      cube: [],
    })
    expect(attachmentCounts).toEqual({ 1: 2, 2: 1, 4: 1 })
  })

  it('gives the lists buildLedger gives for the same months', () => {
    const { ledger } = ledgerFromParts({
      reference,
      rows: [rows('2026-03', '2026-04', [4, 5])],
      cube: [],
    })
    const whole = assembleRows(buildLedger(dataset, ['2026-03', '2026-04']))
    expect(assembleRows(ledger).real.map((t) => t.id)).toEqual(whole.real.map((t) => t.id))
  })
})
