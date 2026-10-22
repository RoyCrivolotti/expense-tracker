// @vitest-environment node
/**
 * The export, read a chunk at a time, is the dataset: for every table, the chunks put end to end are
 * `loadDataset`'s rows for it, in primary-key order, at every chunk size. Run on the real SQL with the real
 * migrations over the synthetic, adversarial, random and awkward ledgers, and over a ledger written through
 * the API so that settings, scenarios and wealth are there too. The in-memory repository, which answers from
 * a dataset, is held to the SQL chunk for chunk.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EXPORT_CHUNK_ROWS,
  EXPORT_TABLES,
  type ExportChunk,
  type ExportTable,
} from '../domain/data/exportTables'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { defaultExpenseSettings } from '../domain/engine/defaults'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { exportChunkOf } from '../../src/testing/inMemoryExport'
import { randomLedger } from '../../src/testing/randomLedger'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, awkwardLedger, queryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { loadDataset } from './db'
import type { Env } from './env'
import { createExpenseWorld, OWNER as WORLD_OWNER, pinClock } from './testing/expenseWorld'
import { seedLedger } from './testing/seedLedger'
import { onRequestPut as putSettings } from '../api/expenses/settings/index'

const SLOW = 60_000

interface Served {
  name: string
  owner: string
  repo: ExpenseRepository
  dataset: ExpenseDataset
}

/** Every chunk of a table, followed with the cursor the way a client would. */
export async function walk(repo: ExpenseRepository, owner: string, table: ExportTable, limit: number): Promise<ExportChunk[]> {
  const chunks: ExportChunk[] = []
  let after: string | undefined
  for (let guard = 0; guard < 100_000; guard += 1) {
    const chunk = await repo.readExportChunk(owner, { table, limit, ...(after !== undefined ? { after } : {}) })
    chunks.push(chunk)
    if (chunk.next === null) return chunks
    after = chunk.next
  }
  throw new Error('the export did not end')
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Rows as a JSON reader sees them, in key order, with the details the dataset leaves unordered settled. */
function expectedRows(dataset: ExpenseDataset, table: ExportTable): unknown[] {
  if (table === 'settings') return [dataset.settings]
  const rows = dataset[table] as unknown as Array<Record<string, unknown>>
  const byKey = [...rows].sort(
    (a, b) =>
      Number(a.id ?? a.accountId) - Number(b.id ?? b.accountId) || String(a.yearMonth ?? '').localeCompare(String(b.yearMonth ?? '')),
  )
  return json(settled(table, byKey))
}

function settled(table: ExportTable, rows: Array<Record<string, unknown>>): unknown[] {
  if (table === 'transactions') {
    return rows.map((t) => ({ ...t, labelIds: [...((t as unknown as Transaction).labelIds ?? [])].sort((a, b) => a - b) }))
  }
  if (table === 'wealthCheckins') {
    return rows.map((c) => ({
      ...c,
      entries: [...(c.entries as Array<{ accountId: number }>)].sort((a, b) => a.accountId - b.accountId),
    }))
  }
  return rows
}

function exportedRows(chunks: ExportChunk[], table: ExportTable): unknown[] {
  const rows = chunks.flatMap((c) => c.rows)
  return json(settled(table, rows as Array<Record<string, unknown>>))
}

/** Chunk sizes worth trying for a table of `n` rows: one at a time, awkward, exact and whole. */
function limitsFor(table: ExportTable, n: number): number[] {
  const bound = EXPORT_CHUNK_ROWS[table]
  const divisor = [2, 3, 4, 5, 7].find((d) => n >= d && n % d === 0)
  const sizes = [1, 7, n, n - 1, divisor ? n / divisor : 0, bound]
  return [...new Set(sizes.filter((s) => s >= 1 && s <= bound))]
}

const served: Served[] = []

beforeAll(async () => {
  // A ledger written through the API, so that every table has a row: settings, scenarios and wealth too.
  pinClock('2026-10-15')
  const sqlite = migratedDatabase()
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  await seedLedger(world)
  await world.call(putSettings, { method: 'PUT', path: '/settings', body: { openingCashCents: 123_400 } })
  const written = await loadDataset(world.env, WORLD_OWNER)
  // Before every generated ledger's plans fall due, so that reading one never inserts an instalment.
  pinClock('2020-01-15')
  const sources: Array<[string, ExpenseDataset]> = [
    ['synthetic', syntheticLedger({ months: 24, perMonth: 30, seed: 3 })],
    ['adversarial', adversarialLedger()],
    ['random 1', randomLedger(1)],
    ['random 2', randomLedger(2)],
    ['random 3', randomLedger(3)],
    ['awkward', awkwardLedger()],
  ]
  for (const [name, source] of sources) {
    const kit = queryDb(source)
    const env: Env = { DB: kit.d1 }
    served.push({ name, owner: OWNER, repo: createD1ExpenseRepository(env), dataset: await loadDataset(env, OWNER) })
  }
  served.push({
    name: 'written through the API',
    owner: WORLD_OWNER,
    repo: createD1ExpenseRepository(world.env),
    dataset: written,
  })
})

afterAll(() => {
  served.length = 0
})

describe('the chunks put end to end are the dataset’s table', () => {
  it.each(EXPORT_TABLES)('%s, in every ledger and at every chunk size', async (table) => {
    for (const { name, owner, repo, dataset } of served) {
      const want = expectedRows(dataset, table)
      for (const limit of limitsFor(table, want.length)) {
        const chunks = await walk(repo, owner, table, limit)
        const got = exportedRows(chunks, table)
        if (table === 'settings') {
          // The dataset shows the defaults for an owner with no settings row; the export holds only rows.
          const row = got[0] ?? json(defaultExpenseSettings())
          expect(row, `${name} settings`).toEqual(want[0])
        } else {
          expect(got, `${name} ${table} at ${limit}`).toEqual(want)
        }
        expect(chunks.every((c) => c.rows.length <= limit), `${name} ${table} chunk size`).toBe(true)
      }
    }
  }, SLOW)

  it('and the ledgers between them put a row in every table', () => {
    const populated = EXPORT_TABLES.filter((table) => served.some((s) => expectedRows(s.dataset, table).length > 0))
    expect(populated).toEqual([...EXPORT_TABLES])
  })
})

describe('the chunks', () => {
  it('end exactly when no row remains: a next cursor means another row, and a full last chunk is not followed by an empty one', async () => {
    for (const { owner, repo, dataset } of served) {
      for (const table of EXPORT_TABLES.filter((t) => t !== 'settings')) {
        const n = (dataset[table] as unknown[]).length
        if (n < 2) continue
        const chunks = await walk(repo, owner, table, n)
        expect(chunks).toHaveLength(1)
        expect(chunks[0]?.next).toBeNull()
        const shorter = await walk(repo, owner, table, n - 1)
        expect(shorter).toHaveLength(2)
        expect(shorter[0]?.next).not.toBeNull()
        expect(shorter[1]?.rows).toHaveLength(1)
      }
    }
  }, SLOW)

  it('never repeat a row, and never hide one that was there throughout, when rows come and go between chunks', async () => {
    const source = syntheticLedger({ months: 12, perMonth: 30, seed: 5 })
    const kit = queryDb(source)
    const repo = createD1ExpenseRepository({ DB: kit.d1 })
    const ids = (await loadDataset({ DB: kit.d1 }, OWNER)).transactions.map((t) => t.id).sort((a, b) => a - b)
    const first = await repo.readExportChunk(OWNER, { table: 'transactions', limit: 100 })
    const seen = first.rows.map((r) => (r as { id: number }).id)
    const cursor = Number(first.next)
    const ahead = ids.filter((id) => id > cursor)

    // What a writer could do between two chunks: remove a row already read, one still to come, and add rows.
    const removedBehind = seen[3]!
    const removedAhead = ahead[10]!
    kit.sqlite.prepare('DELETE FROM transactions WHERE id IN (?, ?)').run(removedBehind, removedAhead)
    const added = [ids.at(-1)! + 1, ids.at(-1)! + 2]
    for (const id of added) {
      kit.sqlite
        .prepare(
          `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
           VALUES (?,?,'2026-01-01','2026-01','Added',?,?,'expense',100,0)`,
        )
        .run(OWNER, id, source.accounts[0]!.id, source.categories[0]!.id)
    }
    const rest = (await walk(repo, OWNER, 'transactions', 100)).flatMap((c) => c.rows.map((r) => (r as { id: number }).id))
    const afterCursor = (await repo.readExportChunk(OWNER, { table: 'transactions', limit: 5_000, after: String(cursor) })).rows.map(
      (r) => (r as { id: number }).id,
    )

    expect(new Set([...seen, ...afterCursor]).size).toBe(seen.length + afterCursor.length)
    expect([...seen, ...afterCursor]).toEqual([...ids.filter((id) => id <= cursor), ...ahead.filter((id) => id !== removedAhead), ...added])
    expect(rest).toEqual([...ids.filter((id) => id !== removedBehind && id !== removedAhead), ...added])
  }, SLOW)
})

describe('the in-memory repository answers chunk for chunk as the SQL does', () => {
  it('for every table of every ledger, at an awkward chunk size', async () => {
    for (const { name, owner, repo, dataset } of served) {
      for (const table of EXPORT_TABLES) {
        const n = (table === 'settings' ? 1 : (dataset[table] as unknown[]).length)
        const limit = Math.max(1, Math.min(EXPORT_CHUNK_ROWS[table], Math.ceil(n / 3)))
        let after: string | undefined
        for (let guard = 0; guard < 1_000; guard += 1) {
          const request = { table, limit, ...(after !== undefined ? { after } : {}) }
          const sql = await repo.readExportChunk(owner, request)
          const memory = exportChunkOf(dataset, request)
          if (table === 'settings' && sql.rows.length === 0) break
          expect(json(memory.rows), `${name} ${table} after ${after}`).toEqual(json(settled(table, sql.rows as never) as object[]))
          expect(memory.next, `${name} ${table} next`).toBe(sql.next)
          if (sql.next === null) break
          after = sql.next
        }
      }
    }
  }, SLOW)
})
