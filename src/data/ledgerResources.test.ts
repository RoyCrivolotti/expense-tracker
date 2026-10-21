import { describe, expect, it } from 'vitest'
import { adversarialLedger } from '../testing/adversarialLedger'
import { memorySource } from '../testing/ledgerSource'
import { holdParts, holdReceipts } from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'
import { NO_EPOCHS, bump, mergeRead, stillCurrent } from './ledgerResources'

describe('epochs', () => {
  it('count the writes to each resource on its own', () => {
    const later = bump(bump(NO_EPOCHS, ['rows']), ['rows', 'cube'])
    expect(later).toEqual({ reference: 0, rows: 2, cube: 1 })
    expect(NO_EPOCHS).toEqual({ reference: 0, rows: 0, cube: 0 })
  })

  it('say which resources a read may still replace', () => {
    expect(stillCurrent(NO_EPOCHS, bump(NO_EPOCHS, ['rows']))).toEqual({ reference: true, rows: false, cube: true })
    expect(stillCurrent(NO_EPOCHS, NO_EPOCHS)).toEqual({ reference: true, rows: true, cube: true })
  })
})

describe('mergeRead', () => {
  const dataset = adversarialLedger()
  const policy = { fullBelowRows: 0, dataMonths: 13 }
  async function twoStates() {
    const source = memorySource(dataset)
    const a = holdParts(await readLedgerParts(source, { policy }))
    source.move('r1')
    const b = holdParts(await readLedgerParts(source, { policy }))
    return { a, b }
  }

  it('takes everything and the new revision when nothing was written meanwhile', async () => {
    const { a, b } = await twoStates()
    const merged = mergeRead(a, b, { reference: true, rows: true, cube: true })
    expect(merged).toEqual(b)
  })

  it('keeps the rows written to meanwhile, takes the rest, and holds no revision', async () => {
    const { a, b } = await twoStates()
    const merged = mergeRead(a, b, { reference: true, rows: false, cube: true })
    expect(merged.rows).toBe(a.rows)
    expect(merged.pinned).toBe(a.pinned)
    expect(merged.reference).toBe(b.reference)
    expect(merged.cells).toBe(b.cells)
    expect(merged.revision).toBeNull()
  })

  it('keeps the reference written to meanwhile', async () => {
    const { a, b } = await twoStates()
    const merged = mergeRead(a, b, { reference: false, rows: true, cube: true })
    expect(merged.reference).toBe(a.reference)
    expect(merged.months).toBe(a.months)
    expect(merged.rows).toBe(b.rows)
    expect(merged.revision).toBeNull()
  })

  it('keeps the sums read for a write meanwhile', async () => {
    const { a, b } = await twoStates()
    const merged = mergeRead(a, b, { reference: true, rows: true, cube: false })
    expect(merged.cells).toBe(a.cells)
    expect(merged.revision).toBeNull()
  })

  it('keeps a receipt list the new counts still agree with, and drops one they do not', async () => {
    const { a, b } = await twoStates()
    const id = Number(Object.keys(b.attachmentCounts)[0])
    const withLists = (count: number) =>
      holdReceipts({ ...a, attachmentCounts: { ...a.attachmentCounts } }, id, Array.from({ length: count }, (_, i) => ({ id: i + 1, transactionId: id, contentType: 'image/jpeg', byteSize: 1, createdAt: 'x', hasThumb: true })))
    const same = mergeRead(withLists(b.attachmentCounts[id]!), b, { reference: true, rows: true, cube: true })
    expect(same.receipts.has(id)).toBe(true)
    const other = mergeRead(withLists(b.attachmentCounts[id]! + 1), b, { reference: true, rows: true, cube: true })
    expect(other.receipts.has(id)).toBe(false)
  })
})
