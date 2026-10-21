import { describe, expect, it } from 'vitest'
import { ValidationError } from '../domain/application/validationError'
import { MAX_CUBE_CELLS, MAX_ROWS_PER_REQUEST } from '../domain/data/ledgerParts'
import { PartTooLargeError } from '../domain/data/ledgerPartsErrors'
import { makeDataset, makeTransaction } from '../testing/factories'
import { inMemoryLedgerParts } from './inMemoryLedgerParts'

const row = (id: number, month: string, over: Parameters<typeof makeTransaction>[0] = {}) =>
  makeTransaction({ id, date: `${month}-10`, budgetMonth: month, ...over })

const dataset = makeDataset({
  transactions: [row(1, '2026-01'), row(2, '2026-02', { type: 'investment' }), row(3, '2026-03'), row(4, '2026-03')],
})

describe('inMemoryLedgerParts', () => {
  const source = inMemoryLedgerParts(() => ({ dataset, revision: 'v1' }))

  it('puts the revision it is at on every part', async () => {
    expect((await source.readReferencePart()).revision).toBe('v1')
    expect((await source.readMonthsPart({ from: '2026-01', to: '2026-03' })).revision).toBe('v1')
    expect((await source.readCubePart({ from: '2026-01', to: '2026-03' })).revision).toBe('v1')
  })

  it('serves the rows of a range and the sums of the unpinned rows in it', async () => {
    const rows = await source.readMonthsPart({ from: '2026-02', to: '2026-03' })
    expect(rows.transactions.map((t) => t.id)).toEqual([4, 3, 2])
    const cube = await source.readCubePart({ from: '2026-01', to: '2026-03' })
    expect(cube.cells.map((c) => [c.budgetMonth, c.count])).toEqual([['2026-01', 1], ['2026-03', 2]])
  })

  it('refuses the ranges the routes refuse, as a rejected promise', async () => {
    await expect(source.readMonthsPart({ from: '2026-03', to: '2026-01' })).rejects.toBeInstanceOf(ValidationError)
    await expect(source.readMonthsPart({ from: '2020-01', to: '2026-01' })).rejects.toBeInstanceOf(ValidationError)
    await expect(source.readCubePart({ from: '2000-01', to: '2026-01' })).rejects.toBeInstanceOf(ValidationError)
    await expect(source.readCubePart({ from: '26-01', to: '2026-01' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a range with more rows than a request returns, and more cells', async () => {
    const many = makeDataset({
      transactions: Array.from({ length: MAX_ROWS_PER_REQUEST + 1 }, (_, i) => row(i + 1, '2026-01')),
    })
    const big = inMemoryLedgerParts(() => ({ dataset: many, revision: 'v1' }))
    await expect(big.readMonthsPart({ from: '2026-01', to: '2026-01' })).rejects.toBeInstanceOf(PartTooLargeError)

    const cells = makeDataset({
      transactions: Array.from({ length: MAX_CUBE_CELLS + 1 }, (_, i) => row(i + 1, '2026-01', { categoryId: i + 1 })),
    })
    const wide = inMemoryLedgerParts(() => ({ dataset: cells, revision: 'v1' }))
    await expect(wide.readCubePart({ from: '2026-01', to: '2026-01' })).rejects.toBeInstanceOf(PartTooLargeError)
  })

  it('reads the dataset on every call, so a part follows the dataset', async () => {
    let held = { dataset, revision: 'v1' }
    const live = inMemoryLedgerParts(() => held)
    expect((await live.readReferencePart()).rowCount).toBe(4)
    held = { dataset: makeDataset({ transactions: [row(1, '2026-01')] }), revision: 'v2' }
    const after = await live.readReferencePart()
    expect([after.rowCount, after.revision]).toEqual([1, 'v2'])
  })

  it('accepts a dataset that arrives later', async () => {
    const later = inMemoryLedgerParts(() => Promise.resolve({ dataset, revision: 'v9' }))
    expect((await later.readReferencePart()).revision).toBe('v9')
  })
})
