import { describe, expect, it } from 'vitest'
import { ValidationError } from '../domain/application/validationError'
import { MAX_CUBE_CELLS, MAX_ROWS_PER_REQUEST } from '../domain/data/ledgerParts'
import { PartTooLargeError } from '../domain/data/ledgerPartsErrors'
import { seriesFromTransactions } from '../domain/engine/recurringSeries'
import { filterTransactions, netSpendCents } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'
import { makeAttachment, makeDataset, makeTransaction } from '../testing/factories'
import { awkwardLedger, filterStream, vocabularyOf } from '../testing/transactionQueryKit'
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

  it('lists the receipts of one transaction, and none for a transaction without any', async () => {
    const withReceipts = makeDataset({
      transactions: [row(1, '2026-01'), row(2, '2026-01')],
      attachments: [makeAttachment({ id: 1, transactionId: 1 }), makeAttachment({ id: 2, transactionId: 1 }), makeAttachment({ id: 3, transactionId: 2 })],
    })
    const served = inMemoryLedgerParts(() => ({ dataset: withReceipts, revision: 'v1' }))
    expect((await served.readReceiptsPart(1)).map((a) => a.id)).toEqual([1, 2])
    expect(await served.readReceiptsPart(9)).toEqual([])
    expect((await served.readReceiptsPart()).map((a) => [a.transactionId, a.id])).toEqual([
      [1, 1],
      [1, 2],
      [2, 3],
    ])
  })

  it('serves the rows of a filter in pages that put end to end are what the engine lists, with a revision on the summary', async () => {
    const ledger = awkwardLedger()
    const held = inMemoryLedgerParts(() => ({ dataset: ledger, revision: 'v3' }))
    for (const filter of filterStream(vocabularyOf(ledger), 25, 5)) {
      const read: Transaction[] = []
      let cursor: string | undefined
      do {
        const page = await held.readTransactionPage(filter, { limit: 37, ...(cursor ? { cursor } : {}) })
        read.push(...page.items)
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      const expected = filterTransactions(ledger.transactions, filter)
      expect(read.map((t) => t.id)).toEqual(expected.map((t) => t.id))
      const summary = await held.readTransactionSummary(filter)
      expect(summary).toMatchObject({ revision: 'v3', netSpendCents: netSpendCents(expected) })
    }
  })

  it('refuses a cursor that was edited or belongs to another filter, as the route does', async () => {
    const ledger = awkwardLedger()
    const held = inMemoryLedgerParts(() => ({ dataset: ledger, revision: 'v3' }))
    const { nextCursor } = await held.readTransactionPage({}, { limit: 5 })
    expect(nextCursor).not.toBeNull()
    await expect(held.readTransactionPage({ status: 'posted' }, { cursor: nextCursor! })).rejects.toBeInstanceOf(ValidationError)
    await expect(held.readTransactionPage({}, { cursor: `${nextCursor!}x` })).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a read whose signal has been aborted', async () => {
    const held = inMemoryLedgerParts(() => ({ dataset, revision: 'v1' }))
    const controller = new AbortController()
    controller.abort()
    await expect(held.readTransactionPage({}, { signal: controller.signal })).rejects.toThrow()
    await expect(held.readTransactionSummary({}, { signal: controller.signal })).rejects.toThrow()
    expect((await held.readTransactionPage({})).items.length).toBeGreaterThan(0)
  })

  it('accepts a dataset that arrives later', async () => {
    const later = inMemoryLedgerParts(() => Promise.resolve({ dataset, revision: 'v9' }))
    expect((await later.readReferencePart()).revision).toBe('v9')
  })

  it('serves the series of every row, as the route does, under the revision it is at', async () => {
    const monthly = Array.from({ length: 5 }, (_, i) =>
      makeTransaction({ id: 10 + i, description: 'Gym', date: `2026-0${i + 1}-05`, budgetMonth: `2026-0${i + 1}`, amountCents: 2500 }),
    )
    const gym = makeDataset({ transactions: [...dataset.transactions, ...monthly] })
    const held = inMemoryLedgerParts(() => ({ dataset: gym, revision: 'v4' }))
    const part = await held.readSeriesPart()
    expect(part).toEqual({ revision: 'v4', series: seriesFromTransactions(gym.transactions) })
    expect(part.series.find((s) => s.label === 'Gym')?.newestDates).toHaveLength(5)
  })
})
