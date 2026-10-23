/**
 * The independent oracle for the ledger rollup (migration 0039, docs/decisions/ledger-rollup.md). It never
 * reads a rollup table to decide what the rollup should hold: the expected cells and months are a GROUP BY
 * over `transactions`, and the expected cube is what `cubeSql` and the domain's `buildCells` make of the
 * rows. The only SQL that reads the rollup is {@link cubeFromCellsSql}, which stands in for the reader the
 * next change will ship, and it is held to those two answers.
 */
import { buildCells, partitionPinned } from '../../domain/ledger'
import { loadDataset } from '../db'
import type { Env } from '../env'
import { PINNED_SQL, UNPINNED_SQL, cubeSql } from '../ledgerPartsSql'

type Param = string | number | null

/** The part of node:sqlite's DatabaseSync the oracle uses, so this file needs no Node types. */
export interface Sqlite {
  exec(sql: string): unknown
  prepare(sql: string): {
    all(...params: Param[]): unknown[]
    get(...params: Param[]): unknown
    run(...params: Param[]): { changes: number | bigint }
  }
}

type Row = Record<string, unknown>

const SIGN_SQL = `CASE WHEN t.amount_cents > 0 THEN 1 WHEN t.amount_cents < 0 THEN -1 ELSE 0 END`
const CELL_KEY = 'owner, pinned, budget_month, account_id, category_id, type, cancelled, sign'

/** What `ledger_cells` has to hold, from the rows alone. */
const FRESH_CELLS_SQL = `SELECT t.owner AS owner, CASE WHEN ${PINNED_SQL} THEN 1 ELSE 0 END AS pinned,
    t.budget_month AS budget_month, t.account_id AS account_id, t.category_id AS category_id, t.type AS type,
    t.cancelled AS cancelled, ${SIGN_SQL} AS sign, SUM(t.amount_cents) AS sum_cents, COUNT(*) AS n
  FROM transactions t GROUP BY 1, 2, 3, 4, 5, 6, 7, 8 ORDER BY 1, 2, 3, 4, 5, 6, 7, 8`

const FRESH_MONTHS_SQL = `SELECT owner, budget_month, COUNT(*) AS n FROM transactions GROUP BY 1, 2 ORDER BY 1, 2`

const STORED_CELLS_SQL = `SELECT ${CELL_KEY}, sum_cents, n FROM ledger_cells ORDER BY 1, 2, 3, 4, 5, 6, 7, 8`
const STORED_MONTHS_SQL = `SELECT owner, budget_month, n FROM ledger_months ORDER BY 1, 2`

/** The group columns of a cube, in the order `cubeSql` returns them. */
const CUBE_COLUMNS = 'budget_month, account_id, category_id, type, cancelled, sign'

/**
 * The cube of a month range as a reader of the rollup would build it: the unpinned cells in the range, less the
 * rows that are the target of another row's `settled_by`, which no trigger can know about. Test code on purpose:
 * the reader that ships it is a later change.
 */
export const CUBE_FROM_CELLS_SQL = `SELECT ${CUBE_COLUMNS}, SUM(amount_cents) AS amount_cents, SUM(n) AS n FROM (
    SELECT ${CUBE_COLUMNS}, sum_cents AS amount_cents, n FROM ledger_cells
      WHERE owner = ?1 AND pinned = 0 AND budget_month >= ?2 AND budget_month <= ?3
    UNION ALL
    SELECT t.budget_month, t.account_id, t.category_id, t.type, t.cancelled, ${SIGN_SQL}, -t.amount_cents, -1
      FROM transactions t
      WHERE t.owner = ?1 AND t.budget_month >= ?2 AND t.budget_month <= ?3 AND ${UNPINNED_SQL}
        AND t.id IN (SELECT settled_by FROM transactions WHERE owner = ?1 AND settled_by IS NOT NULL))
  GROUP BY 1, 2, 3, 4, 5, 6 HAVING SUM(n) > 0 ORDER BY 1, 2, 3, 4, 5, 6`

const all = (db: Sqlite, sql: string, ...params: Param[]): Row[] => db.prepare(sql).all(...params) as Row[]

const show = (rows: Row[]): string => JSON.stringify(rows.map((r) => Object.values(r)))

/** Every difference between two lists of rows, one line each, so a failure says which cell is wrong. */
function differences(what: string, expected: Row[], actual: Row[]): string[] {
  const keyOf = (r: Row) => JSON.stringify(Object.values(r).slice(0, -(what === 'cells' ? 2 : 1)))
  const index = (rows: Row[]) => new Map(rows.map((r) => [keyOf(r), r]))
  const want = index(expected)
  const have = index(actual)
  const lines: string[] = []
  for (const [key, row] of want) {
    const got = have.get(key)
    if (got === undefined) lines.push(`${what}: missing ${show([row])}`)
    else if (show([got]) !== show([row])) lines.push(`${what}: expected ${show([row])} but the rollup has ${show([got])}`)
  }
  for (const [key, row] of have) if (!want.has(key)) lines.push(`${what}: extra ${show([row])}`)
  return lines
}

/** (a), (b) and (d): the cells and months equal a fresh GROUP BY, and none counts below zero. */
export function rollupProblems(db: Sqlite): string[] {
  const negative = all(db, 'SELECT * FROM ledger_cells WHERE n < 0 UNION ALL SELECT owner, budget_month, 0, 0, 0, 0, 0, 0, 0, n FROM ledger_months WHERE n < 0')
  return [
    ...differences('cells', all(db, FRESH_CELLS_SQL), all(db, STORED_CELLS_SQL)),
    ...differences('months', all(db, FRESH_MONTHS_SQL), all(db, STORED_MONTHS_SQL)),
    ...(negative.length > 0 ? [`negative counts: ${show(negative)}`] : []),
  ]
}

export interface MonthWindow {
  from: string
  to: string
}

/** The whole ledger, then the windows a client asks for, taken from the months the owner has. */
export function windowsOf(db: Sqlite, owner: string): MonthWindow[] {
  const months = all(db, 'SELECT DISTINCT budget_month AS m FROM transactions WHERE owner = ? ORDER BY 1', owner).map((r) => String(r.m))
  const first = months[0] ?? '2026-01'
  const mid = months[Math.floor(months.length / 2)] ?? first
  const last = months[months.length - 1] ?? first
  return [{ from: '0000-00', to: '9999-99' }, { from: first, to: mid }, { from: mid, to: last }, { from: last, to: last }]
}

/** Rows of a cube in the shape every source is compared in. */
const cubeRows = (rows: Row[]): string =>
  show(rows.map((r) => ({ month: r.budget_month, account: r.account_id, category: r.category_id, type: r.type, cancelled: Number(r.cancelled), sign: r.sign, cents: r.amount_cents, n: r.n })))

/**
 * (c): the cube read from the cells equals today's `cubeSql` and the domain's `buildCells` over the dataset
 * `loadDataset` returns, for every window. Reading the dataset can write (the instalment backfill inserts rows),
 * so callers check {@link rollupProblems} after this too.
 */
export async function cubeProblems(db: Sqlite, env: Env, owner: string): Promise<string[]> {
  const { transactions } = await loadDataset(env, owner)
  const unpinned = partitionPinned(transactions).rest
  const problems: string[] = []
  for (const { from, to } of windowsOf(db, owner)) {
    const stored = cubeRows(all(db, CUBE_FROM_CELLS_SQL, owner, from, to))
    const sql = cubeSql(owner, { from, to }, 1_000_000)
    const today = cubeRows(all(db, sql.sql, ...(sql.params as Param[])).slice(0, 1_000_000))
    const rows = unpinned.filter((t) => t.budgetMonth >= from && t.budgetMonth <= to)
    const model = cubeRows(buildCells(rows).map((c) => ({ budget_month: c.budgetMonth, account_id: c.accountId, category_id: c.categoryId, type: c.type, cancelled: c.cancelled ? 1 : 0, sign: c.sign, amount_cents: c.amountCents, n: c.count })))
    if (stored !== today) problems.push(`cube ${owner} ${from}..${to}: cells give ${stored}, cubeSql gives ${today}`)
    if (stored !== model) problems.push(`cube ${owner} ${from}..${to}: cells give ${stored}, buildCells gives ${model}`)
  }
  return problems
}
