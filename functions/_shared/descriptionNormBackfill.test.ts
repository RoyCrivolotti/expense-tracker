/**
 * The backfill fills `description_norm` for rows written before the column existed, and the filled
 * value is what the JavaScript `normalizeDesc` gives, not what SQL's `lower(trim(...))` would. These
 * tests run the real SQL on SQLite with the real migrations, over a database seeded the way a database
 * migrated from before the column is: every row waiting.
 */
import { describe, expect, it } from 'vitest'
import { normalizeDesc } from '../../src/domain/engine/recurringDetect'
import { AWKWARD_DESCRIPTIONS, awkwardRows, withAwkwardRows } from '../../src/testing/awkwardDescriptions'
import { makeDataset, makeTransaction } from '../../src/testing/factories'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, queryDb } from '../../src/testing/transactionQueryKit'
import {
  BACKFILL_CHARS,
  BACKFILL_PASSES,
  FILL_SQL,
  PENDING_ROWS_SQL,
  PENDING_SQL,
  fillDescriptionNorm,
  hasPendingDescriptionNorm,
} from './descriptionNormBackfill'

const WAITING = { descriptionNorm: false }
const CREATED = '2026-02-01T00:00:00Z'

interface Stored {
  id: number
  owner: string
  description: string
  description_norm: string | null
}

const stored = (kit: ReturnType<typeof queryDb>, owner?: string): Stored[] =>
  kit.sqlite
    .prepare(
      `SELECT id, owner, description, description_norm FROM transactions ${owner ? 'WHERE owner = ?' : ''} ORDER BY id`,
    )
    .all(...(owner ? [owner] : [])) as unknown as Stored[]

const waiting = (rows: Stored[]) => rows.filter((r) => r.description_norm === null).length

function waitingDb(others = false) {
  const ledger = withAwkwardRows(syntheticLedger({ months: 3, perMonth: 12, seed: 3 }))
  const otherLedger = syntheticLedger({ months: 2, perMonth: 8, seed: 4 })
  return queryDb(ledger, others ? [{ owner: OTHER_OWNER, dataset: otherLedger }] : [], WAITING)
}

describe('the filled value', () => {
  it('is normalizeDesc for every row, including accents, other whitespace and text that normalizes to nothing', async () => {
    const kit = waitingDb()
    const before = stored(kit)
    expect(waiting(before)).toBe(before.length)

    await fillDescriptionNorm(kit.d1, OWNER, { passes: 1000 })

    const after = stored(kit)
    expect(waiting(after)).toBe(0)
    for (const row of after) expect(row.description_norm, JSON.stringify(row.description)).toBe(normalizeDesc(row.description))
  })

  it('differs from SQLite for the descriptions the migration comment names', async () => {
    const kit = waitingDb()
    await fillDescriptionNorm(kit.d1, OWNER, { passes: 1000 })
    const sqlNorm = kit.sqlite.prepare('SELECT description, lower(trim(description)) AS sql_norm, description_norm FROM transactions').all() as unknown as Array<{
      description: string
      sql_norm: string
      description_norm: string
    }>
    const differing = sqlNorm.filter((r) => r.sql_norm !== r.description_norm).map((r) => r.description)
    expect(differing).toEqual(expect.arrayContaining(['CAFÉ', 'Москва', '\tTabbed\n', ' no-break space ', 'İstanbul']))
    expect(differing).not.toContain('Rent')
  })

  it('covers every awkward description the tests use', () => {
    expect(AWKWARD_DESCRIPTIONS.some((d) => d !== d.toLowerCase())).toBe(true)
    expect(awkwardRows(1)).toHaveLength(AWKWARD_DESCRIPTIONS.length)
  })
})

describe('a pass', () => {
  it('fills one chunk and reports that rows are still waiting', async () => {
    const kit = waitingDb()
    const total = stored(kit).length
    const result = await fillDescriptionNorm(kit.d1, OWNER, { rows: 25, passes: 1 })
    expect(result).toEqual({ filled: 25, pending: true })
    expect(waiting(stored(kit))).toBe(total - 25)
  })

  it('takes the waiting rows in a stable order, oldest date first, so a resumed run continues where the last one stopped', async () => {
    const kit = waitingDb()
    const byDate = (kit.sqlite.prepare('SELECT id FROM transactions WHERE owner = ? ORDER BY date, id').all(OWNER) as unknown as Array<{ id: number }>).map((r) => r.id)
    await fillDescriptionNorm(kit.d1, OWNER, { rows: 10, passes: 1 })
    expect(stored(kit).filter((r) => r.description_norm !== null).map((r) => r.id).sort((a, b) => a - b)).toEqual(
      byDate.slice(0, 10).sort((a, b) => a - b),
    )
    await fillDescriptionNorm(kit.d1, OWNER, { rows: 10, passes: 1 })
    expect(stored(kit).filter((r) => r.description_norm !== null).map((r) => r.id).sort((a, b) => a - b)).toEqual(
      byDate.slice(0, 20).sort((a, b) => a - b),
    )
  })

  it('finishes in as many calls as the chunk size needs, and then has nothing left to do', async () => {
    const kit = waitingDb()
    const total = stored(kit).length
    let calls = 0
    for (let pending = true; pending; calls += 1) {
      pending = (await fillDescriptionNorm(kit.d1, OWNER, { rows: 30, passes: 2 })).pending
    }
    expect(calls).toBe(Math.ceil(total / 60))
    expect(await fillDescriptionNorm(kit.d1, OWNER)).toEqual({ filled: 0, pending: false })
    expect(await hasPendingDescriptionNorm(kit.d1, OWNER)).toBe(false)
  })

  it('writes nothing the second time it runs over a filled table', async () => {
    const kit = waitingDb()
    await fillDescriptionNorm(kit.d1, OWNER, { passes: 1000 })
    const snapshot = JSON.stringify(stored(kit))
    kit.statements.length = 0
    expect(await fillDescriptionNorm(kit.d1, OWNER)).toEqual({ filled: 0, pending: false })
    expect(JSON.stringify(stored(kit))).toBe(snapshot)
    expect(kit.statements.map((s) => s.sql)).toEqual([PENDING_ROWS_SQL])
  })

  it('leaves a row that something else filled in between alone', async () => {
    const kit = waitingDb()
    const target = stored(kit)[0]!
    kit.sqlite.prepare("UPDATE transactions SET description_norm = 'set elsewhere' WHERE id = ?").run(target.id)
    await fillDescriptionNorm(kit.d1, OWNER, { passes: 1000 })
    expect(stored(kit)[0]!.description_norm).toBe('set elsewhere')
  })

  // The case that matters: the row was read as waiting, an edit then wrote its value, and the write of the
  // pass arrives with the value it computed from the text before the edit. Only the statement itself can refuse it.
  it('never overwrites a value that arrived after the row was read as waiting', async () => {
    const kit = waitingDb()
    const [first, second] = stored(kit)
    kit.sqlite.prepare("UPDATE transactions SET description_norm = 'written by an edit' WHERE id = ?").run(first!.id)
    const result = await kit.d1
      .prepare(FILL_SQL)
      .bind(OWNER, JSON.stringify([[first!.id, 'stale, from before the edit'], [second!.id, 'filled']]))
      .run()
    expect(result.meta.changes).toBe(1)
    const after = stored(kit)
    expect(after[0]!.description_norm).toBe('written by an edit')
    expect(after[1]!.description_norm).toBe('filled')
  })

  it('stays inside a Worker invocation: two queries a pass, two bound values for the write, and one final check', async () => {
    const kit = waitingDb()
    kit.statements.length = 0
    await fillDescriptionNorm(kit.d1, OWNER, { rows: 5 })
    const sql = kit.statements.map((s) => s.sql)
    expect(sql).toHaveLength(BACKFILL_PASSES * 2 + 1)
    expect(sql.filter((s) => s === FILL_SQL)).toHaveLength(BACKFILL_PASSES)
    expect(sql.at(-1)).toBe(PENDING_SQL)
    for (const s of kit.statements.filter((x) => x.sql === FILL_SQL)) expect(s.params).toHaveLength(2)
  })

  it('writes 500 rows in one statement although D1 allows 100 bound values', async () => {
    const rows = Array.from({ length: 600 }, (_, i) =>
      makeTransaction({ id: i + 1, description: `Shop ${i}`, date: '2026-02-01', budgetMonth: '2026-02', createdAt: CREATED }),
    )
    const kit = queryDb(makeDataset({ transactions: rows }), [], WAITING)
    const result = await fillDescriptionNorm(kit.d1, OWNER, { passes: 1 })
    expect(result).toEqual({ filled: 500, pending: true })
  })

  it('shortens a pass rather than send a very large one, and still makes progress', async () => {
    expect(BACKFILL_CHARS).toBe(40_000)
    const long = 'x'.repeat(30_000)
    const rows = [1, 2, 3].map((id) => makeTransaction({ id, description: `${long}${id}`, createdAt: CREATED }))
    const kit = queryDb(makeDataset({ transactions: rows }), [], WAITING)
    expect(await fillDescriptionNorm(kit.d1, OWNER, { passes: 1 })).toEqual({ filled: 1, pending: true })
    expect(await fillDescriptionNorm(kit.d1, OWNER, { passes: 1, chars: 10 })).toEqual({ filled: 1, pending: true })
    expect(await fillDescriptionNorm(kit.d1, OWNER)).toEqual({ filled: 1, pending: false })
  })

  it('counts what is sent: characters that JSON escapes weigh double, and text outside ASCII is not undercounted', async () => {
    const quotes = '"'.repeat(15_000)
    const rows = [1, 2, 3].map((id) => makeTransaction({ id, description: quotes, createdAt: CREATED }))
    const kit = queryDb(makeDataset({ transactions: rows }), [], WAITING)
    // 15,000 quotes are 30,000 characters of JSON each, so two would be past 40,000 although 15,000 + 15,000 is not.
    expect(await fillDescriptionNorm(kit.d1, OWNER, { passes: 1 })).toEqual({ filled: 1, pending: true })
    expect(stored(kit).map((r) => r.description_norm === null)).toEqual([false, true, true])
  })
})

describe('another owner', () => {
  it('is left waiting while this one is filled, and filled by its own run', async () => {
    const kit = waitingDb(true)
    await fillDescriptionNorm(kit.d1, OWNER, { passes: 1000 })
    expect(waiting(stored(kit, OWNER))).toBe(0)
    const theirs = stored(kit, OTHER_OWNER)
    expect(theirs.length).toBeGreaterThan(0)
    expect(waiting(theirs)).toBe(theirs.length)
    expect(await hasPendingDescriptionNorm(kit.d1, OTHER_OWNER)).toBe(true)

    await fillDescriptionNorm(kit.d1, OTHER_OWNER, { passes: 1000 })
    for (const row of stored(kit, OTHER_OWNER)) expect(row.description_norm).toBe(normalizeDesc(row.description))
  })
})

describe.each([false, true])('the check for rows still waiting, with table statistics: %s', (analyze) => {
  it('reads the owner’s waiting rows through the index and never scans the table', () => {
    const kit = waitingDb(true)
    if (analyze) kit.sqlite.exec('ANALYZE')
    for (const sql of [PENDING_SQL, PENDING_ROWS_SQL]) {
      const plan = kit.sqlite
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(...(sql === PENDING_ROWS_SQL ? [OWNER, 5] : [OWNER])) as unknown as Array<{ detail: string }>
      const details = plan.map((p) => p.detail)
      expect(details.some((d) => /SEARCH transactions USING (COVERING )?INDEX idx_txn_owner_desc_norm \(owner=\? AND description_norm=\?\)/.test(d)), details.join('\n')).toBe(true)
      expect(details.some((d) => /SCAN transactions/.test(d)), details.join('\n')).toBe(false)
    }
  })
})

describe('the statement that writes the values', () => {
  it('loops over the JSON list and looks each row up by its id, so a pass reads a few rows per row filled', () => {
    const kit = waitingDb()
    const plan = (kit.sqlite.prepare(`EXPLAIN QUERY PLAN ${FILL_SQL}`).all(OWNER, '[[1,"a"]]') as unknown as Array<{ detail: string }>).map((p) => p.detail)
    expect(plan[0], plan.join('\n')).toMatch(/^SCAN json_each/)
    expect(plan[1], plan.join('\n')).toBe('SEARCH transactions USING INTEGER PRIMARY KEY (rowid=?)')
    expect(plan).toHaveLength(2)
  })

  it('does not write over a row of another owner, even one named in the list', async () => {
    const kit = waitingDb(true)
    const theirs = stored(kit, OTHER_OWNER)[0]!
    await kit.d1.prepare(FILL_SQL).bind(OWNER, JSON.stringify([[theirs.id, 'planted']])).run()
    expect(stored(kit, OTHER_OWNER).find((r) => r.id === theirs.id)?.description_norm).toBeNull()
  })
})
