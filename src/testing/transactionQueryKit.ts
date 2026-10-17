/**
 * Shared set-up for the tests of the paged transaction reads: a synthetic ledger plus rows built to
 * be awkward (accents, `%` and `_`, ties on a date, withdrawals, a missing account), seeded into a
 * real migrated SQLite database behind the D1 stand-in (which refuses more than 100 bound values, as
 * D1 does) with a record of every statement it runs; and a seeded generator of filters. Import only
 * from node-environment tests.
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { D1Database } from '@cloudflare/workers-types'
import type { TransactionPageRequest } from '../domain/data/transactionQuery'
import { mulberry32 } from '../domain/engine/rng'
import type { TxnFilter } from '../domain/engine/transactions'
import type { ExpenseDataset, Transaction, TxnStatus, TxnType } from '../domain/types'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { seedDataset, type SeedOptions } from './seedSqlite'
import { migratedDatabase, newStats, sqliteD1, type SqliteD1Options, type SqliteD1Stats } from './sqliteD1'
import { syntheticLedger } from './syntheticLedger'

export const OWNER = 'owner@example.com'
export const OTHER_OWNER = 'other@example.com'

export interface RecordedStatement {
  sql: string
  params: unknown[]
}

export interface QueryDb {
  sqlite: DatabaseSync
  /** What the code under test is given: the D1 stand-in, recording every statement bound. */
  d1: D1Database
  stats: SqliteD1Stats
  statements: RecordedStatement[]
}

/** Wraps the stand-in so that a test can look at exactly the statements the code ran. */
function recording(inner: D1Database, statements: RecordedStatement[]): D1Database {
  const prepare = (sql: string) => {
    const statement = inner.prepare(sql)
    return Object.assign(Object.create(statement) as object, {
      bind: (...params: unknown[]) => {
        statements.push({ sql, params })
        return statement.bind(...params)
      },
    })
  }
  return { prepare, batch: (batch: never) => inner.batch(batch) } as unknown as D1Database
}

/** A migrated database holding `dataset` as `owner`'s rows (and any `others`, as theirs). */
export function queryDb(
  dataset: ExpenseDataset,
  others: Array<{ owner: string; dataset: ExpenseDataset }> = [],
  options: SqliteD1Options & SeedOptions = {},
): QueryDb {
  const sqlite = migratedDatabase()
  // Rows that name an account or a label that is not there are the point of some cases.
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, dataset, options)
  others.forEach((other, i) => seedDataset(sqlite, other.owner, shifted(other.dataset, (i + 1) * 1_000_000), options))
  const stats = newStats()
  const statements: RecordedStatement[] = []
  return { sqlite, d1: recording(sqliteD1(sqlite, stats, options), statements), stats, statements }
}

/** Ids are global in D1, so each further owner's rows are moved up by `by` to keep clear of the others'. */
function shifted(dataset: ExpenseDataset, by: number): ExpenseDataset {
  const lift = (t: Transaction): Transaction => {
    const moved: Transaction = {
      ...t,
      id: t.id + by,
      accountId: t.accountId + by,
      categoryId: t.categoryId + by,
      labelIds: (t.labelIds ?? []).map((id) => id + by),
    }
    delete moved.planId
    delete moved.installmentIndex
    if (t.flagId !== undefined) moved.flagId = t.flagId + by
    if (t.settledBy !== undefined) moved.settledBy = t.settledBy + by
    return moved
  }
  return {
    ...dataset,
    transactions: dataset.transactions.map(lift),
    attachments: [],
    installmentPlans: [],
    labels: dataset.labels.map((l) => ({ ...l, id: l.id + by })),
    flags: dataset.flags.map((f) => ({ ...f, id: f.id + by })),
    categories: dataset.categories.map((c) => ({ ...c, id: c.id + by })),
    accounts: dataset.accounts.map((a) => ({ ...a, id: a.id + by })),
    accountStatements: dataset.accountStatements.map((s) => ({ ...s, accountId: s.accountId + by })),
  }
}

const EDGE_START = '2026-05-15'

function edge(id: number, over: Partial<Transaction>): Transaction {
  return {
    id,
    date: '2026-04-10',
    budgetMonth: '2026-04',
    description: 'Edge',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 1_000,
    cancelled: false,
    status: 'posted',
    labelIds: [],
    createdAt: '2026-04-10T09:00:00Z',
    ...over,
  }
}

/** Rows the generated ledger does not produce, each there to catch one way the SQL could drift. */
export function edgeRows(firstId: number): Transaction[] {
  const rows: Array<Partial<Transaction>> = [
    { description: 'CAFÉ ÑANDÚ', notes: 'Reunión ÁÉÍ' },
    { description: 'café con leche', amountCents: 450 },
    { description: 'ÉCLAIR aux fraises', amountCents: 380 },
    { description: 'Москва кафе', amountCents: 1_250 },
    { description: 'МОСКВА', notes: 'Санкт-Петербург' },
    { description: '100% juice', amountCents: 299 },
    { description: '100 juice', amountCents: 299 },
    { description: 'a_b', amountCents: 6_400 },
    { description: 'aXb', amountCents: 6_450 },
    { description: 'Plain', notes: 'needle-in-notes', amountCents: 6_499 },
    { description: 'Plain' },
    { description: 'Broker withdrawal', type: 'investment', amountCents: -250_000, categoryId: 13 },
    { description: 'Broker withdrawal', type: 'investment', amountCents: -5_000, categoryId: 13 },
    { description: 'Index fund', type: 'investment', amountCents: 5_000, categoryId: 13 },
    { description: 'Free sample', amountCents: 0 },
    { description: 'Orphan account', accountId: 99, status: 'posted' },
    { description: 'Orphan account cancelled', accountId: 99, cancelled: true },
    { description: 'Visa cancelled', accountId: 3, cancelled: true, date: '2026-03-02', budgetMonth: '2026-03' },
    { description: 'Visa unpaid', accountId: 3, date: '2026-09-02', budgetMonth: '2026-09' },
    { description: 'Labelled out of order', labelIds: [3, 1] },
    { description: 'Dangling label', labelIds: [2, 77] },
  ]
  const ties = Array.from({ length: 45 }, (_, i): Partial<Transaction> => ({
    description: `Tied ${i % 5}`,
    date: EDGE_START,
    budgetMonth: '2026-05',
    amountCents: 100 + i,
  }))
  return [...rows, ...ties].map((over, i) => edge(firstId + i, over))
}

/** About 3,000 ordinary rows plus the awkward ones; deterministic. */
export function awkwardLedger(): ExpenseDataset {
  const base = syntheticLedger({ months: 36, perMonth: 70, seed: 7 })
  const maxId = base.transactions.reduce((m, t) => Math.max(m, t.id), 0)
  const transactions = [...base.transactions, ...edgeRows(maxId + 1)]
  return { ...base, transactions }
}

/** Every page of a filter, followed with the cursor the way a client would. */
export async function allPages(
  repo: ExpenseRepository,
  owner: string,
  filter: TxnFilter,
  limit: number,
): Promise<Transaction[]> {
  const out: Transaction[] = []
  let page: TransactionPageRequest = { limit }
  for (let guard = 0; guard < 100_000; guard += 1) {
    const result = await repo.queryTransactions(owner, filter, page)
    out.push(...result.items)
    const last = result.items.at(-1)
    if (!result.hasMore || !last) return out
    page = { limit, after: { date: last.date, id: last.id } }
  }
  throw new Error('paging did not end')
}

/** Label order is the attach order, which the engine ignores; compare without it. */
export function withSortedLabels(t: Transaction): Transaction {
  return { ...t, labelIds: [...(t.labelIds ?? [])].sort((a, b) => a - b) }
}

type Rng = () => number
const pick = <T>(items: readonly T[], rnd: Rng): T => items[Math.floor(rnd() * items.length)] as T
const chance = (p: number, rnd: Rng): boolean => rnd() < p

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

function recase(text: string, rnd: Rng): string {
  const roll = rnd()
  if (roll < 0.3) return text.toUpperCase()
  if (roll < 0.6) return text.toLowerCase()
  return text
}

/** A piece of a real row's text, often a different case, sometimes one that spans description and notes. */
function searchText(v: FilterVocabulary, rnd: Rng): string {
  const fixed = ['%', '_', '100%', 'a_b', 'é', 'CAFÉ', 'ñ', 'москва', ' ', 'plain needle', 'plain ', 'x', 'zzzz']
  if (chance(0.25, rnd)) return pick(fixed, rnd)
  const t = pick(v.transactions, rnd)
  if (t.notes && chance(0.4, rnd)) return recase(`${t.description.slice(-3)} ${t.notes.slice(0, 3)}`, rnd)
  const start = Math.floor(rnd() * t.description.length)
  const end = start + 1 + Math.floor(rnd() * 6)
  return recase(t.description.slice(start, end), rnd)
}

function period(v: FilterVocabulary, rnd: Rng): Pick<TxnFilter, 'month' | 'dateFrom' | 'dateTo'> {
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

function dimensions(v: FilterVocabulary, rnd: Rng): TxnFilter {
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

function amounts(rnd: Rng, text: string | undefined): TxnFilter {
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
export function randomFilter(v: FilterVocabulary, rnd: Rng): TxnFilter {
  const text = chance(0.35, rnd) ? searchText(v, rnd) : undefined
  return {
    ...period(v, rnd),
    ...dimensions(v, rnd),
    ...(text !== undefined ? { query: text } : {}),
    ...amounts(rnd, text),
  }
}

export function filterStream(vocabulary: FilterVocabulary, count: number, seed: number): TxnFilter[] {
  const rnd = mulberry32(seed)
  return Array.from({ length: count }, () => randomFilter(vocabulary, rnd))
}

/** `EXPLAIN QUERY PLAN` lines for a statement the code under test ran. */
export function planOf(sqlite: DatabaseSync, { sql, params }: RecordedStatement): string[] {
  const rows = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as SQLInputValue[]))
  return rows.map((row) => String(row.detail))
}
