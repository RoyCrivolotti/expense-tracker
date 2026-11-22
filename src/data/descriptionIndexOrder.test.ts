/**
 * The order the app lists suggestions in, held to a plain reference on generated ledgers full of accents, capitals,
 * padding and ties: a description that starts with the typed text before one that only contains it, the most used
 * first, and among those used as often the one used most recently. The key order is the server's contract and is
 * held to the SQL in `dbDescriptionSuggest.parity.test.ts`; here only what tells the two apart is pinned.
 */
import { describe, expect, it } from 'vitest'
import { generatedRows, keyed, prefixesFor } from '../testing/descriptionLedger'
import { mulberry32 } from '../domain/engine/rng'
import { type IndexRow, buildDescriptionIndex, normalizeDescriptionKey } from './descriptionIndex'

interface Entry {
  key: string
  label: string
  date: string
  id: number
  uses: number
}

/** Every description as its newest row, with a count of its rows, written out plainly. */
function entriesOf(rows: IndexRow[]): Entry[] {
  const byKey = new Map<string, Entry>()
  for (const row of rows) {
    if (row.cancelled || !row.description.trim()) continue
    const key = normalizeDescriptionKey(row.description)
    const held = byKey.get(key)
    const uses = (held?.uses ?? 0) + 1
    if (!held || row.date > held.date || (row.date === held.date && row.id > held.id)) {
      byKey.set(key, { key, label: row.description, date: row.date, id: row.id, uses })
    } else {
      byKey.set(key, { ...held, uses })
    }
  }
  return [...byKey.values()]
}

function reference(rows: IndexRow[]): (
  text: string,
  limit: number,
) => string[] {
  const entries = entriesOf(rows)
  return (
    text,
    limit,
  ) => {
    const typed = normalizeDescriptionKey(text)
    if (!typed) return []
    return entries
      .filter((e) => e.key.includes(typed))
      .sort((a, b) => {
        const starts = Number(b.key.startsWith(typed)) - Number(a.key.startsWith(typed))
        if (starts !== 0) return starts
        if (a.uses !== b.uses) return b.uses - a.uses
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return b.id - a.id
      })
      .slice(0, limit)
      .map((e) => e.label)
  }
}

/** What a person might type: the starts of descriptions, and pieces from inside them. */
function typedFor(
  rows: IndexRow[],
  rnd: () => number,
): string[] {
  const out = new Set(prefixesFor(rows, rnd))
  for (const row of rows) {
    const key = [...normalizeDescriptionKey(row.description)]
    if (key.length > 3 && rnd() < 0.3) out.add(key.slice(1, 3).join(''))
    if (key.length > 5 && rnd() < 0.2) out.add(key.slice(2, 6).join(''))
  }
  return [...out]
}

/** Searches one generated ledger as the reference and the index, and says how many parted from prefixes and the alphabet. */
function checkLedger(seed: number): { searches: number; fromInside: number; notAlphabetical: number } {
  const rnd = mulberry32(seed)
  const rows = generatedRows(seed)
  const expected = reference(rows)
  const index = buildDescriptionIndex(rows)
  const byKey = keyed(rows)
  const counts = { searches: 0, fromInside: 0, notAlphabetical: 0 }
  const cases = typedFor(rows, rnd)
    .filter(() => rnd() < 0.4)
    .flatMap((text) => [1, 3, 8, 25].map((limit) => ({ text, limit })))
  for (const { text, limit } of cases) {
    const mine = index.search(text, limit).map((s) => s.label)
    expect(mine, JSON.stringify({ seed, text, limit })).toEqual(expected(text, limit))
    const typed = normalizeDescriptionKey(text)
    if (mine.some((label) => !normalizeDescriptionKey(label).startsWith(typed))) counts.fromInside += 1
    if (JSON.stringify(byKey.search(text, limit).map((s) => s.label)) !== JSON.stringify(mine))
      counts.notAlphabetical += 1
    counts.searches += 1
  }
  return counts
}

describe('the order the app lists suggestions in', () => {
  it('matches the reference for every text and limit, on ledgers where it parts from the alphabet and from prefixes', () => {
    const total = { searches: 0, fromInside: 0, notAlphabetical: 0 }
    for (let seed = 1; seed <= 25; seed += 1) {
      const counts = checkLedger(seed)
      total.searches += counts.searches
      total.fromInside += counts.fromInside
      total.notAlphabetical += counts.notAlphabetical
    }
    expect(total.searches).toBeGreaterThan(2_000)
    expect(total.fromInside).toBeGreaterThan(100)
    expect(total.notAlphabetical).toBeGreaterThan(100)
  })

  it('puts the description used most first, then the one used last, and a start of the text before a piece of it', () => {
    const base = { type: 'expense', categoryId: 1, accountId: 1, cancelled: false } as const
    const rows: IndexRow[] = [
      { ...base, id: 1, date: '2026-01-01', description: 'Mercado de abastos' },
      { ...base, id: 2, date: '2026-01-02', description: 'Mercadona' },
      { ...base, id: 3, date: '2026-01-03', description: 'Mercadona' },
      { ...base, id: 4, date: '2026-01-04', description: 'Supermercado' },
      { ...base, id: 5, date: '2026-01-05', description: 'Supermercado' },
      { ...base, id: 6, date: '2026-01-06', description: 'Supermercado' },
      { ...base, id: 7, date: '2026-01-07', description: 'Mercería' },
    ]
    const index = buildDescriptionIndex(rows)
    expect(index.search('merc').map((s) => s.label)).toEqual([
      'Mercadona',
      'Mercería',
      'Mercado de abastos',
      'Supermercado',
    ])
    expect(index.search('cado').map((s) => s.label)).toEqual(['Supermercado', 'Mercadona', 'Mercado de abastos'])
    expect(index.search('xyz')).toEqual([])
    expect(index.resolve(' MERCADONA ')).toEqual({
      label: 'Mercadona',
      template: { type: 'expense', categoryId: 1, accountId: 1 },
    })
  })

  it('counts rows of one description whatever their spelling, and not cancelled ones', () => {
    const base = { type: 'expense', categoryId: 1, accountId: 1, cancelled: false } as const
    const rows: IndexRow[] = [
      { ...base, id: 1, date: '2026-01-01', description: 'Gym' },
      { ...base, id: 2, date: '2026-01-02', description: ' GYM ' },
      { ...base, id: 3, date: '2026-01-03', description: 'Gas' },
      { ...base, id: 4, date: '2026-01-04', description: 'Gas', cancelled: true },
      { ...base, id: 5, date: '2026-01-05', description: 'Gas', cancelled: true },
    ]
    expect(
      buildDescriptionIndex(rows)
        .searchEntries('g')
        .map((m) => [m.label, m.uses]),
    ).toEqual([
      [' GYM ', 2],
      ['Gas', 1],
    ])
  })
})

describe('the key order, which is the server’s', () => {
  it('lists only descriptions that start with the text, by the letters of the normalized text', () => {
    const base = { date: '2026-01-01', type: 'expense', categoryId: 1, accountId: 1, cancelled: false } as const
    const rows: IndexRow[] = [
      { ...base, id: 1, description: ' Bar' },
      { ...base, id: 2, description: 'Apple bar' },
      { ...base, id: 3, description: 'Bat' },
    ]
    expect(
      keyed(rows)
        .search('ba')
        .map((s) => s.label),
    ).toEqual([' Bar', 'Bat'])
    expect(
      buildDescriptionIndex(rows)
        .search('ba')
        .map((s) => s.label),
    ).toEqual(['Bat', ' Bar', 'Apple bar'])
    const padded: IndexRow[] = [
      { ...base, id: 1, description: ' Zed' },
      { ...base, id: 2, description: 'Zebra' },
    ]
    expect(
      keyed(padded)
        .search('ze')
        .map((s) => s.label),
    ).toEqual(['Zebra', ' Zed'])
  })

  it('answers a search the same whatever locale, apart from how letters sort', () => {
    const rows = generatedRows(3)
    expect(
      new Set(
        keyed(rows, { locale: 'sv' })
          .search('ä', 25)
          .map((s) => s.label),
      ),
    ).toEqual(
      new Set(
        keyed(rows)
          .search('ä', 25)
          .map((s) => s.label),
      ),
    )
  })
})
