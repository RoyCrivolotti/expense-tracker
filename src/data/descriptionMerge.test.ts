/**
 * Autocomplete over a ledger the browser holds only the newest part of. The browser finds its matches in
 * the rows it holds, the server finds the matches in the rows older than a day, and
 * `mergeDescriptionMatches` joins them. The result has to be what the index over every row gives, for
 * any split of the ledger, which is the property tested here on generated ledgers full of the awkward
 * cases: accents, capitals, padding, descriptions that sort as equal, ties on a date, cancelled rows.
 */
import { describe, expect, it } from 'vitest'
import { descriptionCollator } from '../domain/engine/descriptionSearch'
import { mulberry32 } from '../domain/engine/rng'
import { generatedRows, keyed, prefixesFor } from '../testing/descriptionLedger'
import {
  type IndexRow,
  isNewer,
  mergeDescriptionMatches,
  normalizeDescriptionKey,
} from './descriptionIndex'

const LIMITS = [1, 2, 3, 8, 25]

function check(rows: IndexRow[], split: string, locale: string | undefined, rnd: () => number, prefixes: string[]): number {
  const options = locale ? { locale } : {}
  const whole = keyed(rows, options)
  const older = rows.filter((r) => r.date < split)
  const pinned = new Set(older.filter(() => rnd() < 0.1).map((r) => r.id))
  const held = keyed(
    rows.filter((r) => r.date >= split || pinned.has(r.id)),
    options,
  )
  const server = keyed(older, options)
  let compared = 0
  for (const prefix of prefixes) {
    for (const limit of LIMITS) {
      const merged = mergeDescriptionMatches(held.searchEntries(prefix, limit), server.searchEntries(prefix, limit), limit, locale)
      expect(merged, JSON.stringify({ prefix, limit, split, locale })).toEqual(whole.searchEntries(prefix, limit))
      compared += 1
    }
  }
  return compared
}

describe('the browser’s matches merged with the server’s for older rows', () => {
  it('equal the index over every row, for any split, prefix and limit', () => {
    let compared = 0
    let nonEmpty = 0
    for (let seed = 1; seed <= 30; seed += 1) {
      const rnd = mulberry32(seed * 7)
      const rows = generatedRows(seed)
      const prefixes = prefixesFor(rows, rnd).filter(() => rnd() < 0.35)
      for (const split of ['2025-04-03', '2025-09-01', '2026-02-02']) {
        compared += check(rows, split, undefined, rnd, prefixes)
      }
      nonEmpty += keyed(rows).searchEntries('ca', 8).length
    }
    expect(compared).toBeGreaterThan(5_000)
    expect(nonEmpty).toBeGreaterThan(100)
  })

  it('equal it when letters sort as a Swedish or a Spanish reader expects', () => {
    for (const locale of ['sv', 'es']) {
      const rnd = mulberry32(3)
      const rows = generatedRows(4)
      check(rows, '2025-08-01', locale, rnd, prefixesFor(rows, rnd).filter(() => rnd() < 0.5))
    }
    const rows = [
      { id: 1, date: '2025-01-01', description: 'ärlig', type: 'expense', categoryId: 1, accountId: 1, cancelled: false },
      { id: 2, date: '2025-01-02', description: 'apa', type: 'expense', categoryId: 1, accountId: 1, cancelled: false },
      { id: 3, date: '2025-01-03', description: 'ära', type: 'expense', categoryId: 1, accountId: 1, cancelled: false },
    ] satisfies IndexRow[]
    expect(keyed(rows, { locale: 'sv' }).search('a').map((s) => s.label)).toEqual(['apa'])
    expect(keyed(rows, { locale: 'sv' }).search('ä', 8).map((s) => s.label)).toEqual(['ära', 'ärlig'])
    expect(keyed(rows, { locale: 'sv' }).search('ä', 1)).toHaveLength(1)
  })

  it('give a description to its newest row, whichever side holds it, and break a tie on a date by the id', () => {
    const base = { type: 'expense', categoryId: 1, accountId: 1, cancelled: false } as const
    const own = [{ ...base, id: 5, date: '2026-01-10', description: 'RENT', categoryId: 9 }] satisfies IndexRow[]
    const older = [{ ...base, id: 9, date: '2025-12-01', description: 'Rent', categoryId: 2 }] satisfies IndexRow[]
    const merged = mergeDescriptionMatches(
      keyed(own).searchEntries('re'),
      keyed(older).searchEntries('re'),
    )
    expect(merged).toEqual([{ label: 'RENT', template: { type: 'expense', categoryId: 9, accountId: 1 }, date: '2026-01-10', id: 5 }])

    const sameDay = [
      { ...base, id: 1, date: '2026-01-10', description: 'Gym', categoryId: 1 },
      { ...base, id: 2, date: '2026-01-10', description: 'gym', categoryId: 2 },
    ] satisfies IndexRow[]
    expect(keyed(sameDay).search('gy')).toEqual([{ label: 'gym', template: { type: 'expense', categoryId: 2, accountId: 1 } }])
  })

  it('does not return the older match of a description the browser holds a newer row of', () => {
    const rows = generatedRows(9)
    const merged = mergeDescriptionMatches(
      keyed(rows.filter((r) => r.date >= '2025-09-01')).searchEntries('ca', 25),
      keyed(rows.filter((r) => r.date < '2025-09-01')).searchEntries('ca', 25),
      25,
    )
    const keys = merged.map((m) => normalizeDescriptionKey(m.label))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('buildDescriptionIndex ordering', () => {
  const rowsOf = (...descriptions: string[]): IndexRow[] =>
    descriptions.map((description, i) => ({
      id: i + 1,
      date: '2026-01-01',
      description,
      type: 'expense',
      categoryId: 1,
      accountId: 1,
      cancelled: false,
    }))

  it('lists descriptions in the collator’s order of their base letters', () => {
    expect(keyed(rowsOf('Shop 2', 'shop 10', 'Shop 1', 'SHOP A')).search('shop').map((s) => s.label)).toEqual([
      'Shop 1',
      'shop 10',
      'Shop 2',
      'SHOP A',
    ])
  })

  it('orders descriptions the collator calls equal by their text, whatever order the rows came in', () => {
    const forward = keyed(rowsOf('Café', 'Cafe', 'Cafè')).search('caf').map((s) => s.label)
    const backward = keyed(rowsOf('Cafè', 'Cafe', 'Café')).search('caf').map((s) => s.label)
    expect(forward).toEqual(['Cafe', 'Cafè', 'Café'])
    expect(backward).toEqual(forward)
    expect(descriptionCollator().compare('cafe', 'café')).toBe(0)
  })

  it('keeps the limit, the blank prefix and the cancelled rows as they were', () => {
    const rows = rowsOf(...Array.from({ length: 12 }, (_, i) => `Shop ${i}`))
    expect(keyed(rows).search('shop')).toHaveLength(8)
    expect(keyed(rows).search('shop', 3)).toHaveLength(3)
    expect(keyed(rows).search('   ')).toEqual([])
    expect(keyed([{ ...rows[0]!, cancelled: true }]).search('shop')).toEqual([])
  })

  it('treats the newer of two rows as the speaker of a description', () => {
    expect(isNewer({ date: '2026-01-02', id: 1 } as never, { date: '2026-01-01', id: 9 } as never)).toBe(true)
    expect(isNewer({ date: '2026-01-01', id: 2 } as never, { date: '2026-01-01', id: 9 } as never)).toBe(false)
  })
})
