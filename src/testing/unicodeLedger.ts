/**
 * A ledger of series spelled differently each time they recur, for tests that hold a SQL grouping or a
 * stored normalization to the JavaScript one: accents in either case, whitespace that is not a space,
 * letters whose lower case depends on position or changes length, and text that is only blanks.
 * Placeholder text only.
 */
import type { ExpenseDataset, Transaction } from '../domain/types'
import { makeDataset, makeTransaction } from './factories'

/** A series that repeats `description` monthly, spelled differently each time. */
export function spelledSeries(firstId: number, spellings: string[], extra: Partial<Transaction> = {}): Transaction[] {
  return spellings.map((description, i) =>
    makeTransaction({
      id: firstId + i,
      date: `2025-${String(i + 1).padStart(2, '0')}-10`,
      budgetMonth: `2025-${String(i + 1).padStart(2, '0')}`,
      description,
      createdAt: '2025-01-01T00:00:00Z',
      ...extra,
    }),
  )
}

/** Rows whose descriptions only the JavaScript function groups correctly. */
export function unicodeLedger(): ExpenseDataset {
  const families = [
    ['Café', 'CAFÉ', ' café', 'cafÉ ', '\tCafé\n'],
    ['Москва', 'МОСКВА', 'москва', ' Москва'],
    ['Straße', 'STRASSE', 'straße', 'Straße '],
    ['\u212Aelvin', 'kelvin', 'Kelvin', 'KELVIN'],
    ['İstanbul', 'i̇stanbul', 'İSTANBUL'],
    ['ΟΔΟΣ', 'οδος', 'οδός', 'Οδός'],
    ['🍕 Pizza', '🍕 PIZZA', '🍕 pizza '],
    [' no-break ', 'No-Break', ' no-break'],
    ['Rent', 'rent', 'RENT ', ' Rent'],
  ]
  const transactions = families.flatMap((family, i) => spelledSeries(1 + i * 20, family))
  // Same text on another account and as another type, and the same text with only blanks around it.
  const split = spelledSeries(500, ['Café', 'Café', 'Café'], { accountId: 2 })
  const other = spelledSeries(510, ['Café', 'Café', 'Café'], { type: 'refund' })
  const blanks = spelledSeries(520, ['', '   ', '\t\n', ' '])
  const ordered = [...transactions, ...split, ...other, ...blanks].sort((a, b) =>
    a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1,
  )
  return makeDataset({ transactions: ordered })
}

