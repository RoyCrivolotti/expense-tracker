/**
 * Descriptions whose normalized form (`trim().toLowerCase()`) differs from what SQLite's
 * `lower(trim(...))` gives: accents and other non-ASCII letters in either case, whitespace that is not
 * a space, letters whose lower case changes length or depends on position, and text that normalizes to
 * nothing. For tests that hold a stored `description_norm` or a SQL grouping to the JavaScript
 * function. Placeholder text only.
 */
import type { ExpenseDataset, Transaction } from '../domain/types'
import { makeTransaction } from './factories'

export const AWKWARD_DESCRIPTIONS: readonly string[] = [
  'Café',
  'CAFÉ',
  'café',
  '  café  ',
  'Cafe',
  'Éclair aux fraises',
  'ÉCLAIR AUX FRAISES',
  'Ünïcode Çıkış',
  'Straße',
  'STRASSE',
  'ẞ capital sharp s',
  'İstanbul',
  'Istanbul',
  'i̇stanbul',
  '\u212Aelvin sign',
  'kelvin sign',
  'ΟΔΟΣ',
  'οδός',
  'Σίσυφος',
  'Москва',
  'МОСКВА',
  '東京',
  'ＦＵＬＬ ｗｉｄｔｈ',
  'ǅ digraph',
  '🍕 Pizza',
  '🍕 PIZZA',
  '\tTabbed\n',
  ' no-break space ',
  '﻿byte order mark',
  ' em space ',
  '　ideographic space　',
  'pipe | inside',
  'Rent',
  'rent ',
  ' RENT',
  '',
  '   ',
  '\t\n',
]

/** One row for each awkward description, with ids from `firstId` up, newest date first. */
export function awkwardRows(firstId: number, overrides: Partial<Transaction> = {}): Transaction[] {
  return AWKWARD_DESCRIPTIONS.map((description, i) =>
    makeTransaction({
      id: firstId + i,
      date: '2026-03-15',
      budgetMonth: '2026-03',
      description,
      accountId: 1,
      categoryId: 1,
      amountCents: 1_000 + i,
      createdAt: '2026-03-15T09:00:00Z',
      ...overrides,
    }),
  )
}

/** `dataset` with one row per awkward description added (ids above its own). */
export function withAwkwardRows(dataset: ExpenseDataset): ExpenseDataset {
  const firstId = Math.max(0, ...dataset.transactions.map((t) => t.id)) + 1
  return { ...dataset, transactions: [...dataset.transactions, ...awkwardRows(firstId)] }
}
