import { describe, expect, it } from 'vitest'
import { readPushSlots } from '../../../src/domain/capture'
import type { Slot } from '../../../src/domain/capture'
import { slotsJson } from './storedText'

const code = (index: number): Slot => ({ kind: 'code', index })

describe('slotsJson', () => {
  it('writes every slot when they fit', () => {
    const slots = readPushSlots('Card payment', 'Paid 12,50 EUR with card **4821 on 2026-11-03')
    expect(JSON.parse(slotsJson(slots))).toEqual(slots)
    expect(slotsJson([])).toBe('[]')
  })

  it('keeps the longest run from the start that fits 2,000 characters, and is still valid JSON', () => {
    const slots = Array.from({ length: 3000 }, (_, i) => code(i))
    const json = slotsJson(slots)
    expect(json.length).toBeLessThanOrEqual(2000)
    const kept = JSON.parse(json) as Slot[]
    expect(kept).toEqual(slots.slice(0, kept.length))
    // One more slot would not have fitted.
    expect(JSON.stringify(slots.slice(0, kept.length + 1)).length).toBeGreaterThan(2000)
  })

  it('stops at a slot too long for the column rather than skip it', () => {
    const huge: Slot = {
      kind: 'number',
      index: 1,
      raw: '9'.repeat(2500),
      candidates: [],
      currency: null,
      negative: false,
    }
    expect(slotsJson([code(0), huge, code(2)])).toBe(JSON.stringify([code(0)]))
  })
})
