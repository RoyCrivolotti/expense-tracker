import { describe, expect, it } from 'vitest'
import { adversarialLedger } from '../testing/adversarialLedger'
import { memorySource } from '../testing/ledgerSource'
import { holdParts } from './ledgerHold'
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
})
