/**
 * A seeded generator of filters for the paged transaction reads: every field of `TxnFilter` can appear, alone or
 * with others, with search text taken from the rows themselves. Import only from node-environment tests.
 */
import { mulberry32 } from '../domain/engine/rng'
import type { TxnFilter } from '../domain/engine/transactions'
import type { ExpenseDataset, Transaction, TxnStatus, TxnType } from '../domain/types'

type Rng = () => number
const pick = <T>(
  items: readonly T[],
  rnd: Rng,
): T => items[Math.floor(rnd() * items.length)] as T
const chance = (
  p: number,
  rnd: Rng,
): boolean => rnd() < p

export interface FilterVocabulary {
  transactions: Transaction[]
  months: string[]
  categoryIds: number[]
  accountIds: number[]
}

export function vocabularyOf(dataset: ExpenseDataset): FilterVocabulary {
  return {
    transactions: dataset.transactions,
    months: [...new Set(dataset.transactions.map((t) => t.budgetMonth))].sort(),
    categoryIds: dataset.categories.map((c) => c.id),
    accountIds: dataset.accounts.map((a) => a.id),
  }
}

function recase(
  text: string,
  rnd: Rng,
): string {
  const roll = rnd()
  if (roll < 0.3) return text.toUpperCase()
  if (roll < 0.6) return text.toLowerCase()
  return text
}

/** A piece of a real row's text, often a different case, sometimes one that spans description and notes. */
function searchText(
  v: FilterVocabulary,
  rnd: Rng,
): string {
  const fixed = ['%', '_', '100%', 'a_b', 'é', 'CAFÉ', 'ñ', 'москва', ' ', 'plain needle', 'plain ', 'x', 'zzzz']
  if (chance(0.25, rnd)) return pick(fixed, rnd)
  const t = pick(v.transactions, rnd)
  if (t.notes && chance(0.4, rnd)) return recase(`${t.description.slice(-3)} ${t.notes.slice(0, 3)}`, rnd)
  const start = Math.floor(rnd() * t.description.length)
  const end = start + 1 + Math.floor(rnd() * 6)
  return recase(t.description.slice(start, end), rnd)
}

function period(
  v: FilterVocabulary,
  rnd: Rng,
): Pick<TxnFilter, 'month' | 'dateFrom' | 'dateTo'> {
  const roll = rnd()
  if (roll < 0.4) return {}
  if (roll < 0.7) return { month: pick(v.months, rnd) }
  const a = pick(v.transactions, rnd).date
  const b = pick(v.transactions, rnd).date
  const [from, to] = a <= b || chance(0.1, rnd) ? [a, b] : [b, a]
  const shape = rnd()
  const range: Pick<TxnFilter, 'month' | 'dateFrom' | 'dateTo'> =
    shape < 0.2 ? { dateFrom: from } : shape < 0.4 ? { dateTo: to } : { dateFrom: from, dateTo: to }
  return chance(0.3, rnd) ? { ...range, month: pick(v.months, rnd) } : range
}

const TYPES: Array<TxnType | 'all'> = ['expense', 'income', 'investment', 'refund', 'all']
const STATUSES: Array<TxnStatus | 'all'> = ['posted', 'forecast', 'cancelled', 'all']
const AMOUNTS = [0, 1, 299, 450, 1_000, 5_000, 6_400, 6_499, 20_000, 250_000, 10_000_000]

function dimensions(
  v: FilterVocabulary,
  rnd: Rng,
): TxnFilter {
  const out: TxnFilter = {}
  if (chance(0.2, rnd)) out.categoryId = chance(0.1, rnd) ? 999 : pick(v.categoryIds, rnd)
  if (chance(0.15, rnd)) out.accountId = chance(0.1, rnd) ? 99 : pick(v.accountIds, rnd)
  if (chance(0.2, rnd)) out.type = pick(TYPES, rnd)
  if (chance(0.25, rnd)) out.status = pick(STATUSES, rnd)
  if (chance(0.15, rnd)) out.flagId = pick([1, 2, 'none', 'none', 9] as const, rnd)
  if (chance(0.15, rnd)) {
    out.labelIds = chance(0.1, rnd) ? [] : [...new Set([pick([1, 2, 3, 99], rnd), pick([1, 3], rnd)])]
  }
  return out
}

function amounts(
  rnd: Rng,
  text: string | undefined,
): TxnFilter {
  const out: TxnFilter = {}
  if (chance(0.2, rnd)) out.amountMinCents = pick(AMOUNTS, rnd)
  if (chance(0.2, rnd)) out.amountMaxCents = pick(AMOUNTS, rnd)
  if (text !== undefined && chance(0.4, rnd)) {
    const from = pick(AMOUNTS, rnd)
    out.queryAmount = { fromCents: from, toCents: from + (chance(0.5, rnd) ? 99 : 0) }
  }
  return out
}

/** One random filter; every field of `TxnFilter` can appear, alone or with others. */
export function randomFilter(
  v: FilterVocabulary,
  rnd: Rng,
): TxnFilter {
  const text = chance(0.35, rnd) ? searchText(v, rnd) : undefined
  return {
    ...period(v, rnd),
    ...dimensions(v, rnd),
    ...(text !== undefined ? { query: text } : {}),
    ...amounts(rnd, text),
  }
}

export function filterStream(
  vocabulary: FilterVocabulary,
  count: number,
  seed: number,
): TxnFilter[] {
  const rnd = mulberry32(seed)
  return Array.from({ length: count }, () => randomFilter(vocabulary, rnd))
}
