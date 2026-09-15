// @vitest-environment node
// node:sqlite cannot be bundled for jsdom, and SQLite is the point here: the rest of
// this file's tests assert against a hand-rolled D1 stub, which can confirm that a
// statement was sent but nothing at all about whether it computes the right answer.
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { REPORT_SNAPSHOT_SQL } from './dbWrite'

/** The settle, as bulkUpdateTransactions builds it for a `settledBy` patch. */
const SETTLE = `UPDATE transactions SET settled_by = ?, updated_at = datetime('now')
   WHERE owner = ? AND id IN (1, 2, 3) AND (settled_by IS NULL OR settled_by = ?)`

let db: DatabaseSync

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, owner TEXT, type TEXT, amount_cents INTEGER,
    settled_by INTEGER, report_count INTEGER, report_covered_cents INTEGER, updated_at TEXT
  )`)
  // Two expenses and a vendor refund on one claim, the payment, and a foreign row.
  db.exec(`INSERT INTO transactions (id, owner, type, amount_cents) VALUES
    (1,'me','expense',10000),(2,'me','expense',4000),(3,'me','refund',1500),
    (9,'me','refund',12500),(4,'other','expense',9999)`)
})

function snapshotOf(id: number) {
  return db
    .prepare('SELECT report_count, report_covered_cents FROM transactions WHERE id = ?')
    .get(id) as { report_count: number | null; report_covered_cents: number | null }
}

describe('the report snapshot statement, against real SQLite', () => {
  it('counts and totals what the settle in the same transaction just linked', () => {
    // The load-bearing assumption behind putting both in one batch: the subqueries have
    // to see settled_by as the statement before them left it, not as it was on entry.
    db.exec('BEGIN')
    db.prepare(SETTLE).run(9, 'me', 9)
    db.prepare(REPORT_SNAPSHOT_SQL).run('me', 9)
    db.exec('COMMIT')

    expect(snapshotOf(9)).toEqual({ report_count: 3, report_covered_cents: 12500 })
  })

  it('subtracts a refund among the covered rows rather than adding it', () => {
    db.prepare(SETTLE).run(9, 'me', 9)
    db.prepare(REPORT_SNAPSHOT_SQL).run('me', 9)

    // 10000 + 4000 - 1500, matching how listPastReports totals the same rows.
    expect(snapshotOf(9).report_covered_cents).toBe(12500)
  })

  it('never reaches another owner, even at the same payment id', () => {
    db.prepare('UPDATE transactions SET settled_by = 9 WHERE id = 4').run()
    db.prepare(SETTLE).run(9, 'me', 9)
    db.prepare(REPORT_SNAPSHOT_SQL).run('me', 9)

    expect(snapshotOf(9).report_count).toBe(3)
  })

  it('stamps the payment and nothing else', () => {
    db.prepare(SETTLE).run(9, 'me', 9)
    db.prepare(REPORT_SNAPSHOT_SQL).run('me', 9)

    expect(snapshotOf(1).report_count).toBeNull()
  })

  it('takes the settle down with it when the second statement fails', () => {
    // Why the two share a batch: a settle that committed without its record is the
    // inconsistency these columns exist to prevent.
    db.exec('BEGIN')
    db.prepare(SETTLE).run(9, 'me', 9)
    expect(() => db.prepare('UPDATE transactions SET nope = 1 WHERE id = 9').run()).toThrow()
    db.exec('ROLLBACK')

    const row = db.prepare('SELECT settled_by FROM transactions WHERE id = 1').get() as {
      settled_by: number | null
    }
    expect(row.settled_by).toBeNull()
  })
})
