/**
 * Autocomplete over a ledger the browser holds only the newest part of. The browser finds its matches in the rows
 * it holds, the server finds the descriptions starting with the same text among the older rows, and
 * `mergeDescriptionMatches` joins them in the order the list shows. The rules tested here on generated ledgers full
 * of the awkward cases (accents, capitals, padding, ties on a date, cancelled rows): nothing is listed twice, nothing
 * is listed that no row has, the newest row speaks for a description whichever side holds it, the browser's count
 * is kept, and the server's finds come after the browser's own among descriptions that match the same way.
 */
import { describe, expect, it } from 'vitest'
import { descriptionCollator } from '../domain/engine/descriptionSearch'
import { mulberry32 } from '../domain/engine/rng'
import { generatedRows, keyed, prefixesFor } from '../testing/descriptionLedger'
import {
  type IndexRow,
  type IndexedMatch,
  buildDescriptionIndex,
  compareByUsage,
  isNewer,
  mergeDescriptionMatches,
  normalizeDescriptionKey,
} from './descriptionIndex'

const LIMITS = [1, 2, 3, 8, 25]

/**
 * What the merge should list, written out plainly: the union by normalized key, the newest row speaking for a
 * description and the browser's count kept (the server's finds count as unused), in the order the list shows.
 */
function expectedMerge(
  own: readonly IndexedMatch[],
  older: readonly IndexedMatch[],
  text: string,
  limit: number,
): string[] {
  const typed = normalizeDescriptionKey(text)
  const byKey = new Map<string, IndexedMatch>()
  for (const match of [...own, ...older.map((m) => ({ ...m, uses: 0 }))]) {
    const key = normalizeDescriptionKey(match.label)
    const held = byKey.get(key)
    const uses = Math.max(match.uses, held?.uses ?? 0)
    const newest = !held || match.date > held.date || (match.date === held.date && match.id > held.id) ? match : held
    byKey.set(key, { ...newest, uses })
  }
  return [...byKey]
    .sort(([ka, a], [kb, b]) => {
      const starts = Number(kb.startsWith(typed)) - Number(ka.startsWith(typed))
      if (starts !== 0) return starts
      if (a.uses !== b.uses) return b.uses - a.uses
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return b.id - a.id
    })
    .slice(0, limit)
    .map(([, m]) => m.label)
}

/** A description the browser holds keeps its count; one only the server found counts as unused. */
function expectCounts(
  merged: readonly IndexedMatch[],
  own: readonly IndexedMatch[],
  where: string,
): void {
  const ownUses = new Map(own.map((m) => [normalizeDescriptionKey(m.label), m.uses]))
  for (const m of merged) expect(m.uses, where).toBe(ownUses.get(normalizeDescriptionKey(m.label)) ?? 0)
}

function check(
  rows: IndexRow[],
  split: string,
  rnd: () => number,
  texts: string[],
): number {
  const whole = buildDescriptionIndex(rows)
  const olderRows = rows.filter((r) => r.date < split)
  const pinned = new Set(olderRows.filter(() => rnd() < 0.1).map((r) => r.id))
  const heldRows = rows.filter((r) => r.date >= split || pinned.has(r.id))
  const held = buildDescriptionIndex(heldRows)
  const server = keyed(olderRows)
  let compared = 0
  for (const text of texts) {
    const typed = normalizeDescriptionKey(text)
    const every = new Set(whole.searchEntries(text, Infinity).map((m) => normalizeDescriptionKey(m.label)))
    for (const limit of LIMITS) {
      const own = held.searchEntries(text, limit)
      const older = server.searchEntries(typed, limit)
      const merged = mergeDescriptionMatches(own, older, { text, limit })
      const where = JSON.stringify({ text, limit, split })
      const keys = merged.map((m) => normalizeDescriptionKey(m.label))
      expect(new Set(keys).size, where).toBe(keys.length)
      expect(merged.length, where).toBeLessThanOrEqual(limit)
      for (const key of keys) expect(every.has(key), where).toBe(true)
      const inOrder = merged.map((entry) => ({ key: normalizeDescriptionKey(entry.label), entry }))
      const compare = compareByUsage(typed)
      for (let i = 1; i < inOrder.length; i += 1) expect(compare(inOrder[i - 1]!, inOrder[i]!), where).toBeLessThan(0)
      // Every description the browser holds is listed before the server's finds that match the same way, since
      // the browser's rows count and the server's do not.
      if (older.length === 0) expect(merged, where).toEqual(own)
      expect(
        merged.map((m) => m.label),
        where,
      ).toEqual(
        expectedMerge(
          own,
          older.map((m) => ({ ...m, uses: 0 })),
          text,
          limit,
        ),
      )
      expectCounts(merged, own, where)
      compared += 1
    }
  }
  return compared
}

describe('the browser’s matches merged with the server’s for older rows', () => {
  it('keep the rules above for any split, text and limit', () => {
    let compared = 0
    for (let seed = 1; seed <= 30; seed += 1) {
      const rnd = mulberry32(seed * 7)
      const rows = generatedRows(seed)
      const texts = prefixesFor(rows, rnd).filter(() => rnd() < 0.35)
      for (const split of ['2025-04-03', '2025-09-01', '2026-02-02']) compared += check(rows, split, rnd, texts)
    }
    expect(compared).toBeGreaterThan(5_000)
  }, 60_000)

  it('give a description to its newest row, whichever side holds it, and keep the browser’s count of it', () => {
    const base = { type: 'expense', categoryId: 1, accountId: 1, cancelled: false } as const
    const own = [
      { ...base, id: 5, date: '2026-01-10', description: 'RENT', categoryId: 9 },
      { ...base, id: 4, date: '2026-01-01', description: 'rent', categoryId: 9 },
    ] satisfies IndexRow[]
    const older = [{ ...base, id: 9, date: '2025-12-01', description: 'Rent', categoryId: 2 }] satisfies IndexRow[]
    const merged = mergeDescriptionMatches(
      buildDescriptionIndex(own).searchEntries('re'),
      keyed(older).searchEntries('re'),
      { text: 're' },
    )
    expect(merged).toEqual([
      { label: 'RENT', template: { type: 'expense', categoryId: 9, accountId: 1 }, date: '2026-01-10', id: 5, uses: 2 },
    ])

    const newerOnServer = [
      { ...base, id: 9, date: '2026-02-01', description: 'Rent', categoryId: 2 },
    ] satisfies IndexRow[]
    const [first] = mergeDescriptionMatches(
      buildDescriptionIndex(own).searchEntries('re'),
      keyed(newerOnServer).searchEntries('re'),
      { text: 're' },
    )
    expect(first).toEqual({
      label: 'Rent',
      template: { type: 'expense', categoryId: 2, accountId: 1 },
      date: '2026-02-01',
      id: 9,
      uses: 2,
    })
    expect(isNewer(first!, { label: 'RENT', template: first!.template, date: '2026-01-10', id: 5 })).toBe(true)
  })

  it('list the server’s finds after the browser’s own that match the same way, and a start of the text before a piece', () => {
    const base = { type: 'expense', categoryId: 1, accountId: 1, cancelled: false } as const
    const own = [
      { ...base, id: 1, date: '2026-01-01', description: 'Supermercado' },
      { ...base, id: 2, date: '2026-01-02', description: 'Mercería' },
    ] satisfies IndexRow[]
    const older: IndexedMatch[] = []
    const found = keyed([{ ...base, id: 7, date: '2025-05-01', description: 'Mercadona' }]).searchEntries('merc')
    const merged = mergeDescriptionMatches(buildDescriptionIndex(own).searchEntries('merc'), found, { text: 'merc' })
    expect(merged.map((m) => [m.label, m.uses])).toEqual([
      ['Mercería', 1],
      ['Mercadona', 0],
      ['Supermercado', 1],
    ])
    expect(
      mergeDescriptionMatches(buildDescriptionIndex(own).searchEntries('merc'), older, { text: 'merc', limit: 1 }).map(
        (m) => m.label,
      ),
    ).toEqual(['Mercería'])
  })

  it('does not return the older match of a description the browser holds a newer row of', () => {
    const rows = generatedRows(9)
    const merged = mergeDescriptionMatches(
      buildDescriptionIndex(rows.filter((r) => r.date >= '2025-09-01')).searchEntries('ca', 25),
      keyed(rows.filter((r) => r.date < '2025-09-01')).searchEntries('ca', 25),
      { text: 'ca', limit: 25 },
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
    expect(
      keyed(rowsOf('Shop 2', 'shop 10', 'Shop 1', 'SHOP A'))
        .search('shop')
        .map((s) => s.label),
    ).toEqual(['Shop 1', 'shop 10', 'Shop 2', 'SHOP A'])
  })

  it('orders descriptions the collator calls equal by their text, whatever order the rows came in', () => {
    const forward = keyed(rowsOf('Café', 'Cafe', 'Cafè'))
      .search('caf')
      .map((s) => s.label)
    const backward = keyed(rowsOf('Cafè', 'Cafe', 'Café'))
      .search('caf')
      .map((s) => s.label)
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
