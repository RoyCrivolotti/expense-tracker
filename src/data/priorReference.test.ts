import { describe, expect, it } from 'vitest'
import { syntheticLedger } from '../testing/syntheticLedger'
import { memorySource } from '../testing/ledgerSource'
import { startingFrom } from './priorReference'

describe('startingFrom', () => {
  const dataset = syntheticLedger({ months: 6, perMonth: 8, seed: 1 })

  it('answers the first read of the reference with the one it was given, without asking the source', async () => {
    const source = memorySource(dataset)
    const reference = await source.readReferencePart()
    source.calls.length = 0
    const wrapped = startingFrom(source, reference)
    expect(await wrapped.readReferencePart()).toBe(reference)
    expect(source.calls).toEqual([])
  })

  it('reads the source for every read after the first, so a reference is never kept longer than that', async () => {
    const source = memorySource(dataset)
    const reference = await source.readReferencePart()
    source.calls.length = 0
    const wrapped = startingFrom(source, reference)
    await wrapped.readReferencePart()
    source.move('r1')
    expect((await wrapped.readReferencePart()).revision).toBe('r1')
    await wrapped.readReferencePart()
    expect(source.calls).toEqual(['reference', 'reference'])
  })

  it('leaves every other read to the source', async () => {
    const source = memorySource(dataset)
    const wrapped = startingFrom(source, await source.readReferencePart())
    source.calls.length = 0
    await wrapped.readMonthsPart({ from: '2026-01', to: '2026-01' })
    await wrapped.readCubePart({ from: '2026-01', to: '2026-01' })
    expect(source.calls).toEqual(['months:2026-01..2026-01', 'cube:2026-01..2026-01'])
  })

  it('does not change the source it wraps', async () => {
    const source = memorySource(dataset)
    startingFrom(source, await source.readReferencePart())
    source.move('r1')
    expect((await source.readReferencePart()).revision).toBe('r1')
  })
})
