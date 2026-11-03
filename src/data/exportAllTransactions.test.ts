import { describe, expect, it, vi } from 'vitest'
import type { TransactionExportPart } from '../domain/data/ledgerParts'
import { makeTransaction } from '../testing/factories'
import { exportAllTransactions } from './exportAllTransactions'

const row = (id: number, date = '2025-01-10') => makeTransaction({ id, date, budgetMonth: date.slice(0, 7) })
type Chunk = TransactionExportPart

/** A source that answers the n-th call with the n-th chunk, whatever it is asked. */
function chunks(...answers: Chunk[]) {
  const asked: Array<{ after?: string; signal?: AbortSignal } | undefined> = []
  return {
    asked,
    readTransactionExport: vi.fn((request?: { after?: string; signal?: AbortSignal }) => {
      asked.push(request)
      return Promise.resolve(answers[asked.length - 1]!)
    }),
  }
}

describe('exportAllTransactions', () => {
  it('follows the cursor to the end and lists every row newest first, ties by id', async () => {
    const source = chunks(
      { revision: 'r', rows: [row(1, '2025-01-01'), row(2, '2025-03-01')], next: '2' },
      { revision: 'r', rows: [row(3, '2025-03-01'), row(4, '2024-12-31')], next: null },
    )
    const rows = await exportAllTransactions(source)
    expect(rows.map((r) => r.id)).toEqual([3, 2, 1, 4])
    expect(source.asked).toEqual([{}, { after: '2' }])
  })

  it('hands the signal to every read', async () => {
    const signal = new AbortController().signal
    const source = chunks({ revision: 'r', rows: [row(1)], next: '1' }, { revision: 'r', rows: [row(2)], next: null })
    await exportAllTransactions(source, signal)
    expect(source.asked.map((a) => a?.signal)).toEqual([signal, signal])
  })

  it('starts again when a later chunk was read under another revision, and keeps only the second walk', async () => {
    const source = chunks(
      { revision: 'a', rows: [row(1)], next: '1' },
      { revision: 'b', rows: [row(2)], next: null },
      { revision: 'b', rows: [row(1)], next: '1' },
      { revision: 'b', rows: [row(2), row(3)], next: null },
    )
    expect((await exportAllTransactions(source)).map((r) => r.id).sort()).toEqual([1, 2, 3])
    expect(source.asked.map((a) => a?.after)).toEqual([undefined, '1', undefined, '1'])
  })

  it('gives up after three walks that each found the ledger moved', async () => {
    const moving = Array.from({ length: 3 }, (_, i): Chunk[] => [
      { revision: `a${i}`, rows: [row(1)], next: '1' },
      { revision: `b${i}`, rows: [row(2)], next: null },
    ]).flat()
    const source = chunks(...moving)
    await expect(exportAllTransactions(source)).rejects.toThrow('kept changing')
    expect(source.readTransactionExport).toHaveBeenCalledTimes(6)
  })

  it('passes a failed read on', async () => {
    const source = { readTransactionExport: () => Promise.reject(new Error('offline')) }
    await expect(exportAllTransactions(source)).rejects.toThrow('offline')
  })
})
