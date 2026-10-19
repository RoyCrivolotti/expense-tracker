import { describe, expect, it } from 'vitest'
import { normalizeDesc } from './normalizeDescription'
import { normalizeDesc as fromRecurringDetect } from './recurringDetect'

/**
 * `transactions.description_norm` stores these results. If one changes, every stored value for such a
 * description is stale and is never recomputed, so a change to `normalizeDesc` needs a migration that sets
 * the column to NULL, and this list is what makes forgetting that a failing test.
 */
const PINNED: Array<[input: string, expected: string]> = [
  ['', ''],
  ['   ', ''],
  ['Rent', 'rent'],
  ['  RENT\t', 'rent'],
  ['\n Gym membership \r\n', 'gym membership'],
  [' no-break space ', 'no-break space'],
  ['﻿byte order mark', 'byte order mark'],
  ['　ideographic space　', 'ideographic space'],
  ['Café', 'café'],
  ['CAFÉ', 'café'],
  ['Éclair aux fraises', 'éclair aux fraises'],
  ['Straße', 'straße'],
  ['STRASSE', 'strasse'],
  ['ẞ', 'ß'],
  ['İstanbul', 'i̇stanbul'],
  ['Kelvin', 'kelvin'],
  ['ΟΔΟΣ', 'οδος'],
  ['ΣΑΣ', 'σας'],
  ['Σίσυφος', 'σίσυφος'],
  ['Москва', 'москва'],
  ['ǅ', 'ǆ'],
  ['東京', '東京'],
  ['ＦＵＬＬ', 'ｆｕｌｌ'],
  ['🍕 PIZZA', '🍕 pizza'],
  ['a | b', 'a | b'],
]

describe('normalizeDesc', () => {
  it.each(PINNED)('turns %j into %j', (input, expected) => {
    expect(normalizeDesc(input)).toBe(expected)
  })

  it('is trim then toLowerCase and nothing else, which is what SQLite cannot do', () => {
    for (const [input] of PINNED) expect(normalizeDesc(input)).toBe(input.trim().toLowerCase())
  })

  it('is the function the engines import, whichever module they take it from', () => {
    expect(fromRecurringDetect).toBe(normalizeDesc)
  })
})
