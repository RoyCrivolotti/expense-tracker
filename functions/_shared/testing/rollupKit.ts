/**
 * What the rollup tests share: a world over two owners on SQLite with the real migrations, a seeded random
 * source, helpers that call the real routes, and a counter of every row written to the rollup tables.
 */
import { onRequestPost as postAccount } from '../../api/expenses/accounts/index'
import { onRequestPost as postCategory } from '../../api/expenses/categories/index'
import { onRequestPost as postFlag } from '../../api/expenses/flags/index'
import { onRequestPost as postLabel } from '../../api/expenses/labels/index'
import { OTHER, OWNER, type Handler, type World } from './expenseWorld'
import { cubeProblems, rollupProblems, type Sqlite } from './rollupOracle'

export const OWNERS = [OWNER, OTHER]
export const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

export interface Kit {
  world: World
  sqlite: Sqlite
  rng: () => number
  /** Every step taken, newest last, so a failure says how the ledger got there. */
  history: string[]
}

/** A small deterministic generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const chance = (k: Kit, p: number): boolean => k.rng() < p
export const int = (k: Kit, n: number): number => Math.floor(k.rng() * n)
export function pick<T>(k: Kit, items: readonly T[]): T {
  return items[int(k, items.length)]!
}

export interface Reply {
  status: number
  body: Record<string, unknown>
}

export interface CallOptions {
  method?: string
  params?: Record<string, string>
  body?: unknown
}

/** One request to a real route as `owner`; the reply is returned whatever its status, a step decides what a refusal means. */
export async function call(k: Kit, owner: string, handler: Handler, path: string, options: CallOptions = {}): Promise<Reply> {
  const response = await k.world.call(handler, { email: owner, method: options.method ?? 'GET', path, ...options })
  const text = await response.text()
  return { status: response.status, body: text.startsWith('{') ? (JSON.parse(text) as Record<string, unknown>) : {} }
}

export function rows(k: Kit, sql: string, ...params: Array<string | number | null>): Array<Record<string, unknown>> {
  return k.sqlite.prepare(sql).all(...params) as Array<Record<string, unknown>>
}

/** The ids of a table's rows for an owner, oldest first. */
export function idsOf(k: Kit, table: string, owner: string, where = '1 = 1'): number[] {
  return rows(k, `SELECT id FROM ${table} WHERE owner = ? AND ${where} ORDER BY id`, owner).map((r) => Number(r.id))
}

async function created(k: Kit, owner: string, handler: Handler, path: string, body: unknown): Promise<number> {
  const reply = await call(k, owner, handler, path, { method: 'POST', body })
  if (reply.status !== 201) throw new Error(`seeding ${path}: ${reply.status} ${JSON.stringify(reply.body)}`)
  return Number(reply.body.id)
}

export const newAccount = (k: Kit, owner: string, kind: 'debit' | 'credit' = 'debit') =>
  created(k, owner, postAccount, '/accounts', { name: `${kind} ${k.history.length}`, kind, settlement: kind === 'credit' ? 'deferred' : 'immediate', active: true })

export const newCategory = (k: Kit, owner: string) =>
  created(k, owner, postCategory, '/categories', { name: `Category ${k.history.length}`, monthlyBudgetCents: 50_000, sortOrder: 1, active: true })

export const newFlag = (k: Kit, owner: string) =>
  created(k, owner, postFlag, '/flags', { name: `Flag ${k.history.length}`, color: '#6366F1', sortOrder: 0, active: true })

export const newLabel = (k: Kit, owner: string) =>
  created(k, owner, postLabel, '/labels', { name: `Label ${k.history.length}`, color: '#10B981', sortOrder: 0, active: true })

/** Two accounts (one debit, one card), three categories, two flags and two labels for each owner. */
export async function seedReference(k: Kit): Promise<void> {
  for (const owner of OWNERS) {
    await newAccount(k, owner)
    await newAccount(k, owner, 'credit')
    for (let i = 0; i < 3; i += 1) await newCategory(k, owner)
    for (let i = 0; i < 2; i += 1) {
      await newFlag(k, owner)
      await newLabel(k, owner)
    }
  }
}

/** Counts every row written to `ledger_cells` and `ledger_months` from the call on, however it got there. */
export function countRollupWrites(sqlite: Sqlite): () => number {
  sqlite.exec('CREATE TEMP TABLE IF NOT EXISTS rollup_writes (t TEXT)')
  for (const table of ['ledger_cells', 'ledger_months']) {
    for (const verb of ['INSERT', 'UPDATE', 'DELETE']) {
      sqlite.exec(`CREATE TEMP TRIGGER IF NOT EXISTS count_${table}_${verb} AFTER ${verb} ON main.${table} BEGIN INSERT INTO rollup_writes VALUES ('${table}'); END`)
    }
  }
  return () => Number((sqlite.prepare('SELECT COUNT(*) AS c FROM temp.rollup_writes').all()[0] as { c: number }).c)
}

/** (a) to (d) over the whole database, for both owners; throws with the steps taken if anything differs. */
export async function assertRollup(k: Kit, label: string): Promise<void> {
  const problems: string[] = []
  for (const owner of OWNERS) problems.push(...(await cubeProblems(k.sqlite, k.world.env, owner)))
  problems.push(...rollupProblems(k.sqlite))
  if (problems.length > 0) {
    const steps = k.history.slice(-8).join('\n  ')
    throw new Error(`after ${label}:\n${problems.slice(0, 6).join('\n')}\nlast steps:\n  ${steps}`)
  }
}
