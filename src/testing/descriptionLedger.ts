/**
 * Descriptions for tests of autocomplete: rows spread over eighteen months, drawn from a vocabulary of
 * accents, capitals, padding, descriptions that sort as equal, an emoji and a few with numbers, with
 * ties on a date and some cancelled rows. Placeholder text only.
 */
import { type DescriptionIndexOptions, type IndexRow, buildDescriptionIndex, normalizeDescriptionKey } from '../data/descriptionIndex'
import { mulberry32 } from '../domain/engine/rng'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { makeDataset } from './factories'

const WORDS = ['cafe', 'café', 'CAFÉ', 'Cafè', 'rent', 'Rent ', ' RENT', 'ñandú', 'nandu', 'Ünï', 'uni', 'münchen', 'mùnchen', 'straße', 'STRASSE', 'shop', 'Shop', '🍕 pizza', 'pizza', 'ärlig', 'apa', 'zebra']
const SUFFIXES = ['', ' 1', ' 2', ' bar', ' 10', ' é']

export function generatedRows(seed: number, count = 260): IndexRow[] {
  const rnd = mulberry32(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!
  return Array.from({ length: count }, (_, i): IndexRow => {
    const month = 1 + Math.floor(rnd() * 18)
    const year = 2025 + Math.floor((month - 1) / 12)
    const day = 1 + Math.floor(rnd() * 6)
    return {
      id: i + 1,
      date: `${year}-${String(((month - 1) % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      description: `${pick(WORDS)}${pick(SUFFIXES)}`,
      type: pick(['expense', 'expense', 'income', 'refund'] as const),
      categoryId: 1 + Math.floor(rnd() * 5),
      accountId: 1 + Math.floor(rnd() * 3),
      cancelled: rnd() < 0.08,
    }
  })
}

/** The prefixes a person might type for these rows: every start of every description, in several spellings. */
export function prefixesFor(rows: IndexRow[], rnd: () => number): string[] {
  const out = new Set<string>(['c', 'ca', 'caf', 'r', 're', 'ren', 'n', 'ñ', 'u', 'm', 's', 'st', 'p', '🍕', 'a', 'z', 'zzz', 'x'])
  for (const row of rows) {
    const key = normalizeDescriptionKey(row.description)
    for (const length of [1, 2, 3, 5]) {
      const start = [...key].slice(0, length).join('')
      if (start === '') continue
      out.add(start)
      if (rnd() < 0.2) out.add(start.toUpperCase())
      if (rnd() < 0.1) out.add(` ${start} `)
    }
  }
  return [...out]
}

/** The index in the order the server's answer for older rows is in, which is the one a merge can be exact in. */
export const keyed = (rows: IndexRow[], options: Omit<DescriptionIndexOptions, 'order'> = {}) =>
  buildDescriptionIndex(rows, { ...options, order: 'key' })

/** The rows as a dataset a database can be seeded with, newest first as the API serves them. */
export function descriptionDataset(seed: number, count = 260): ExpenseDataset {
  const transactions = generatedRows(seed, count).map(
    (row): Transaction => ({
      ...row,
      budgetMonth: row.date.slice(0, 7),
      amountCents: 1_000 + row.id,
      status: row.cancelled ? 'cancelled' : 'posted',
      createdAt: `${row.date}T08:00:00Z`,
    }),
  )
  transactions.sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
  return makeDataset({ transactions })
}
