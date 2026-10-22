// @vitest-environment node
/**
 * The ids of a row's labels are read by a subquery that every transaction read carries (the list, one row, the
 * months, the pinned rows and the export). Left to choose, SQLite starts it from the owner's labels and looks for the
 * row's links under each, so a page of 100 rows visits every label of the owner 100 times and the cost grows with the
 * number of labels as well as with the rows. The links of the row are read first, and each label is checked by
 * primary key, whatever the number of labels is; these tests fail on the plan that is not that, with and without
 * table statistics, and hold the new subquery to the old one's answer on ledgers with labels that are gone, labels of
 * other owners, rows with none and rows with several.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Label } from '../domain/types'
import { mulberry32 } from '../domain/engine/rng'
import { randomLedger } from '../../src/testing/randomLedger'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, planOf, queryDb, type QueryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { LABEL_IDS_SQL } from './transactionQuerySql'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'

/** The subquery as it was written before the join order was fixed. */
const OLD_LABEL_IDS_SQL = `(SELECT json_group_array(tl.label_id)
      FROM transaction_labels tl JOIN labels l ON l.id = tl.label_id AND l.owner = t.owner
      WHERE tl.transaction_id = t.id)`

function labelled(labelCount: number, seed: number) {
  const base = syntheticLedger({ months: 6, perMonth: 40, seed })
  const rnd = mulberry32(seed)
  const labels: Label[] = Array.from({ length: labelCount }, (_, i) => ({
    id: i + 1,
    name: `Label ${i + 1}`,
    color: '#10b981',
    sortOrder: i,
    // A label that is switched off still names the rows that carry it.
    active: i % 5 !== 4,
  }))
  return {
    ...base,
    labels,
    transactions: base.transactions.map((t) => ({
      ...t,
      labelIds:
        rnd() < 0.4
          ? []
          : [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => 1 + Math.floor(rnd() * (labelCount + 2))))],
    })),
  }
}

describe.each([{ stats: false }, { stats: true }])('label ids in the transaction reads (table statistics: $stats)', ({ stats }) => {
  let kit: QueryDb
  let repo: ExpenseRepository

  beforeAll(() => {
    const others = Array.from({ length: 4 }, (_, i) => ({ owner: `other${i}@example.com`, dataset: labelled(20, 90 + i) }))
    kit = queryDb(labelled(20, 7), others)
    if (stats) kit.sqlite.exec('ANALYZE')
    repo = createD1ExpenseRepository({ DB: kit.d1 })
  })

  /** What each read ran, as the repository ran it. */
  const READS: Array<[string, (r: ExpenseRepository) => Promise<unknown>]> = [
    ['the list', (r) => r.queryTransactions(OWNER, {}, { limit: 100 })],
    ['the list on a label', (r) => r.queryTransactions(OWNER, { labelIds: [1, 5] }, { limit: 100 })],
    ['one row', (r) => r.getTransaction(OWNER, 10)],
    ['the months', (r) => r.readMonthRows(OWNER, { from: '2026-01', to: '2026-06' }, 5_000)],
    ['the pinned rows and the payments', (r) => r.readLedgerReference(OWNER)],
    ['the export', (r) => r.readExportChunk(OWNER, { table: 'transactions', limit: 500 })],
  ]

  it.each(READS)('%s reads the links of a row first and checks each label by key', async (_name, read) => {
    kit.statements.length = 0
    await read(repo)
    const withLabels = kit.statements.filter((s) => s.sql.includes('json_group_array'))
    expect(withLabels.length).toBeGreaterThan(0)
    for (const statement of withLabels) {
      const text = planOf(kit.sqlite, statement).join('\n')
      expect(text, `walks the owner's labels:\n${text}`).not.toMatch(/SEARCH l USING (COVERING )?INDEX idx_labels_owner \(owner=\?\)/)
      expect(text, `scans labels:\n${text}`).not.toMatch(/^\s*SCAN l\b/m)
      expect(text, `does not look a label up by key:\n${text}`).toMatch(/SEARCH l USING (INTEGER PRIMARY KEY \(rowid=\?\)|COVERING INDEX idx_labels_owner \(owner=\? AND rowid=\?\))/)
      expect(text, `does not read the links by transaction:\n${text}`).toMatch(/SEARCH tl USING (COVERING )?INDEX \w+ \(transaction_id=\?/)
    }
  })
})

describe('the subquery answers as it did', () => {
  const rows = (kit: QueryDb, sql: string): Array<{ id: number; ids: number[] }> =>
    (kit.sqlite.prepare(`SELECT t.id AS id, ${sql} AS ids FROM transactions t ORDER BY t.id`).all() as Array<{ id: number; ids: string }>).map(
      (r) => ({ id: r.id, ids: (JSON.parse(r.ids) as number[]).sort((a, b) => a - b) }),
    )

  const ledgers: Array<[string, () => QueryDb]> = [
    ['several labels, some rows with none', () => queryDb(labelled(20, 3), [{ owner: OTHER_OWNER, dataset: labelled(8, 4) }])],
    ['three labels', () => queryDb(labelled(3, 5), [{ owner: OTHER_OWNER, dataset: labelled(3, 6) }])],
    ['forty labels', () => queryDb(labelled(40, 8))],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed): [string, () => QueryDb] => [`random ledger ${seed}`, () => queryDb(randomLedger(seed), [{ owner: OTHER_OWNER, dataset: randomLedger(seed + 100) }])]),
  ]

  it.each(ledgers)('%s', (_name, build) => {
    const kit = build()
    // A link to a label that belongs to another owner must be dropped, as a link to one that is gone is.
    const foreign = kit.sqlite.prepare('SELECT id FROM labels WHERE owner <> ? LIMIT 1').get(OWNER) as { id: number } | undefined
    const mine = kit.sqlite.prepare('SELECT id FROM transactions WHERE owner = ? LIMIT 3').all(OWNER) as Array<{ id: number }>
    if (foreign) for (const { id } of mine) kit.sqlite.prepare('INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)').run(id, foreign.id)

    const was = rows(kit, OLD_LABEL_IDS_SQL)
    const now = rows(kit, LABEL_IDS_SQL)

    expect(now).toEqual(was)
    expect(now.length).toBeGreaterThan(0)
  })

  it('has rows with several labels, rows with one and rows with none to compare', () => {
    const kit = queryDb(labelled(20, 3))
    const sizes = new Set(rows(kit, LABEL_IDS_SQL).map((r) => Math.min(r.ids.length, 3)))

    expect([...sizes].sort()).toEqual([0, 1, 2, 3])
  })
})
