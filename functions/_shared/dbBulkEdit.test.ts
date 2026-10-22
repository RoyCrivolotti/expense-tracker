import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { AMOUNT_SIGN_MESSAGE } from '../domain/data/amountSign'
import {
  BULK_CHANGED_MESSAGE,
  MAX_FILTER_EDIT_ROWS,
  bulkCountMessage,
  bulkTooManyMessage,
} from '../domain/data/bulkEdit'
import type { BulkTransactionPatch } from '../domain/data/dataSource'
import { normalizeDesc } from '../domain/engine/normalizeDescription'
import {
  OTHER,
  OTHER_IDS,
  OWNER,
  OWNER_IDS,
  beforeEachBatch,
  idsWhere,
  smallLedger,
  type SmallLedger,
} from '../../src/testing/smallLedgerDb'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { guardSql } from './batchGuard'
import { bulkUpdateTransactions } from './dbWrite'
import type { Env } from './env'
import type { TxnFilter } from '../domain/engine/transactions'

/**
 * The filter form of bulk edit on a real SQLite database with the real migrations, which refuses a statement
 * that binds more than the 100 values D1 allows. The ledger is small and hand-built so every expectation
 * names the rows it means; the random-filter comparison with the engine is in dbBulkEdit.parity.test.ts.
 */

const A = OWNER_IDS
const B = OTHER_IDS
const EXPENSES: TxnFilter = { type: 'expense' }

let ledger: SmallLedger
let repo: ReturnType<typeof createD1ExpenseRepository>

function useDatabase(inner: D1Database): void {
  repo = createD1ExpenseRepository({ DB: inner } as Env)
}

beforeEach(() => {
  ledger = smallLedger(6)
  useDatabase(ledger.d1)
})

/** Everything an edit can touch, for both owners, so "nothing changed" is a comparison and not a hope. */
function dump(db: DatabaseSync = ledger.db): unknown {
  return {
    transactions: db
      .prepare(
        `SELECT id, owner, date, budget_month, description, description_norm, account_id, category_id, type,
                amount_cents, flag_id, settled_by, report_count, report_covered_cents
         FROM transactions ORDER BY id`,
      )
      .all(),
    labels: db.prepare('SELECT transaction_id, label_id FROM transaction_labels ORDER BY transaction_id, label_id').all(),
  }
}

const edit = (filter: TxnFilter, expectedCount: number, patch: BulkTransactionPatch, owner = OWNER) =>
  repo.bulkUpdateTransactionsByFilter(owner, { filter, expectedCount }, patch)

describe('editing the rows a filter matches', () => {
  it('changes those rows and no others, and says how many', async () => {
    const before = (dump() as { transactions: Array<{ id: number }> }).transactions

    const result = await edit({ ...EXPENSES, month: '2026-08' }, 2, { accountId: A.card })

    expect(result).toEqual({ updated: 2 })
    const after = (dump() as { transactions: Array<{ id: number }> }).transactions
    const changed = after.filter((row, i) => JSON.stringify(row) !== JSON.stringify(before[i]))
    expect(changed.map((row) => row.id)).toEqual([1, 4])
    expect(idsWhere(ledger.db, 'owner = ? AND account_id = ?', OWNER, A.card)).toEqual([1, 4])
  })

  it('does nothing, and writes nothing, for a filter that matches no rows when none were expected', async () => {
    const before = dump()

    expect(await edit({ month: '2031-01' }, 0, { categoryId: A.travel })).toEqual({ updated: 0 })

    expect(dump()).toEqual(before)
  })

  it('finds the rows with one statement, bounded by the cap, and writes them in one batch', async () => {
    const sent: string[] = []
    let batches = 0
    useDatabase({
      prepare: (sql: string) => {
        sent.push(sql)
        return ledger.d1.prepare(sql)
      },
      batch: (statements: Parameters<D1Database['batch']>[0]) => {
        batches += 1
        return ledger.d1.batch(statements)
      },
    } as unknown as D1Database)

    await edit(EXPENSES, 6, { description: 'Renamed' })

    const finds = sent.filter((sql) => sql.startsWith('SELECT t.id FROM transactions t'))
    expect(finds).toHaveLength(1)
    expect(finds[0]).toContain(`LIMIT ${MAX_FILTER_EDIT_ROWS + 1}`)
    expect(batches).toBe(1)
  })

  it('stores the normalized description beside the description, as every other write does', async () => {
    await edit(EXPENSES, 6, { description: '  Café   Latte ' })

    const rows = ledger.db
      .prepare("SELECT description, description_norm FROM transactions WHERE owner = ? AND type = 'expense'")
      .all(OWNER) as Array<{ description: string; description_norm: string }>
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(row.description_norm).toBe(normalizeDesc(row.description))
  })

  it('labels every row it flags with the flag’s auto-label, and no row it does not flag', async () => {
    await edit({ ...EXPENSES, categoryId: A.food }, 3, { flagId: A.flag })

    const labelled = ledger.db
      .prepare('SELECT transaction_id AS id FROM transaction_labels WHERE label_id = ? ORDER BY transaction_id')
      .all(A.autoLabel) as Array<{ id: number }>
    expect(labelled.map((r) => r.id)).toEqual([1, 3, 5])
  })

  it('stamps the payment with what it covers, as settling by ids does', async () => {
    await edit({ ...EXPENSES, month: '2026-09' }, 4, { settledBy: A.paymentA })

    expect(ledger.db.prepare('SELECT report_count, report_covered_cents FROM transactions WHERE id = ?').get(A.paymentA)).toEqual({
      report_count: 4,
      report_covered_cents: 1_001 + 1_002 + 1_004 + 1_005,
    })
    expect(idsWhere(ledger.db, 'settled_by = ?', A.paymentA)).toEqual([2, 3, 5, 6])
  })
})

describe('refusing an edit and changing nothing', () => {
  it.each([
    ['one row fewer than were shown', 1],
    ['one row more than were shown', 3],
    ['rows when none were shown', 0],
  ])('answers 409 for %s', async (_name, expected) => {
    const before = dump()

    await expect(edit({ ...EXPENSES, month: '2026-08' }, expected, { categoryId: A.travel })).rejects.toMatchObject({
      status: 409,
      message: bulkCountMessage(2, expected),
    })

    expect(dump()).toEqual(before)
  })

  it('answers 400 for a patch that names another owner’s account, category, flag or payment', async () => {
    const before = dump()
    const cases: Array<[BulkTransactionPatch, string]> = [
      [{ accountId: B.account }, 'Invalid accountId'],
      [{ categoryId: B.food }, 'Invalid categoryId'],
      [{ flagId: B.flag }, 'Invalid flagId'],
      [{ settledBy: B.paymentA }, 'Invalid settledBy'],
    ]
    for (const [patch, message] of cases) {
      await expect(edit(EXPENSES, 6, patch)).rejects.toMatchObject({ status: 400, message })
    }

    expect(dump()).toEqual(before)
  })

  it('answers 409 when a row is already settled by another payment', async () => {
    ledger.db.prepare('UPDATE transactions SET settled_by = ? WHERE id = 3').run(A.paymentB)
    const before = dump()

    await expect(edit({ ...EXPENSES, month: '2026-09' }, 4, { settledBy: A.paymentA })).rejects.toMatchObject({
      status: 409,
      message: 'Some of those transactions are already settled by another reimbursement',
    })

    expect(dump()).toEqual(before)
  })

  it('answers 400 when the edit would leave a withdrawal on an expense', async () => {
    ledger.db
      .prepare(
        `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
         VALUES (?,70,'2026-09-12','2026-09','Sold fund',?,?,'investment',-2000,0)`,
      )
      .run(OWNER, A.account, A.food)
    const before = dump()

    await expect(edit({ type: 'investment' }, 1, { type: 'expense' })).rejects.toMatchObject({
      status: 400,
      message: AMOUNT_SIGN_MESSAGE,
    })

    expect(dump()).toEqual(before)
    await expect(edit({ type: 'investment' }, 1, { categoryId: A.travel })).resolves.toEqual({ updated: 1 })
  })

  it('answers 400 for a patch with nothing in it', async () => {
    await expect(edit(EXPENSES, 6, {})).rejects.toMatchObject({ status: 400, message: 'Empty patch' })
  })
})

describe('a request that races another', () => {
  /** Plays `other` as a concurrent request that lands after the rows were found and before the batch. */
  function racing(other: () => void): void {
    useDatabase(beforeEachBatch(ledger.d1, other))
  }

  const insertExpense = (id: number, month = '2026-08') =>
    ledger.db
      .prepare(
        `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
         VALUES (?,?,?,?,'Late',?,?,'expense',900,0)`,
      )
      .run(OWNER, id, `${month}-15`, month, A.account, A.food)

  it('writes nothing when a row joins the filter in the gap', async () => {
    racing(() => insertExpense(71))
    const before = dump()

    await expect(edit({ ...EXPENSES, month: '2026-08' }, 2, { categoryId: A.travel })).rejects.toMatchObject({
      status: 409,
      message: BULK_CHANGED_MESSAGE,
    })

    ledger.db.prepare('DELETE FROM transactions WHERE id = 71').run()
    expect(dump()).toEqual(before)
  })

  it('writes nothing when one row leaves and another joins, so the count is the same', async () => {
    racing(() => {
      ledger.db.prepare("UPDATE transactions SET budget_month = '2026-09' WHERE id = 1").run()
      insertExpense(72)
    })

    await expect(edit({ ...EXPENSES, month: '2026-08' }, 2, { categoryId: A.travel })).rejects.toMatchObject({
      status: 409,
      message: BULK_CHANGED_MESSAGE,
    })

    expect(idsWhere(ledger.db, 'category_id = ? AND id IN (1, 4, 72)', A.travel)).toEqual([4])
    expect(ledger.db.prepare('SELECT category_id FROM transactions WHERE id = 4').get()).toEqual({ category_id: A.travel })
  })

  it('writes nothing when a row of the filter is deleted in the gap', async () => {
    racing(() => ledger.db.prepare('DELETE FROM transactions WHERE id = 4').run())

    await expect(edit({ ...EXPENSES, month: '2026-08' }, 2, { categoryId: A.travel })).rejects.toMatchObject({
      status: 409,
      message: BULK_CHANGED_MESSAGE,
    })

    expect(ledger.db.prepare('SELECT category_id FROM transactions WHERE id = 1').get()).toEqual({ category_id: A.food })
  })

  it('writes nothing when another payment settles one of the rows in the gap', async () => {
    racing(() => ledger.db.prepare('UPDATE transactions SET settled_by = ? WHERE id = 5').run(A.paymentB))

    await expect(edit({ ...EXPENSES, month: '2026-09' }, 4, { settledBy: A.paymentA })).rejects.toMatchObject({
      status: 409,
    })

    expect(idsWhere(ledger.db, 'settled_by = ?', A.paymentA)).toEqual([])
    expect(ledger.db.prepare('SELECT report_count FROM transactions WHERE id = ?').get(A.paymentA)).toEqual({
      report_count: null,
    })
  })

  it('undoes the whole batch when any statement in it fails', async () => {
    useDatabase({
      prepare: ledger.d1.prepare.bind(ledger.d1),
      batch: (statements: Parameters<D1Database['batch']>[0]) =>
        ledger.d1.batch([...statements, ledger.d1.prepare(guardSql('1 = 2'))]),
    } as unknown as D1Database)
    const before = dump()

    await expect(edit({ ...EXPENSES, flagId: 'none' }, 6, { flagId: A.flag, description: 'Renamed' })).rejects.toThrow()

    expect(dump()).toEqual(before)
  })
})

describe('the same edit by ids and by filter', () => {
  const PATCHES: Array<[string, BulkTransactionPatch]> = [
    ['category', { categoryId: A.travel }],
    ['account', { accountId: A.card }],
    ['type', { type: 'income' }],
    ['date', { date: '2026-07-02' }],
    ['budget month', { budgetMonth: '2026-11' }],
    ['description', { description: ' Café Latte ' }],
    ['flag', { flagId: A.flag }],
    ['settlement', { settledBy: A.paymentA }],
    ['several at once', { categoryId: A.travel, description: 'Both', flagId: A.flag, budgetMonth: '2026-12' }],
  ]

  /** `updated_at` is the time of the write, so the two databases may differ in it by a second. */
  const withoutTimestamps = (db: DatabaseSync) => {
    db.exec("UPDATE transactions SET updated_at = ''")
    return dump(db)
  }

  it.each(PATCHES)('leaves the database as the ids form does: %s', async (_name, patch) => {
    const filter: TxnFilter = { type: 'expense', month: '2026-09' }
    const matched = idsWhere(ledger.db, "owner = ? AND type = 'expense' AND budget_month = '2026-09'", OWNER)
    const twin = smallLedger(6)

    await bulkUpdateTransactions({ DB: twin.d1 } as Env, OWNER, matched, patch)
    const result = await edit(filter, matched.length, patch)

    expect(result).toEqual({ updated: matched.length })
    expect(withoutTimestamps(ledger.db)).toEqual(withoutTimestamps(twin.db))
  })
})

describe('isolation between owners', () => {
  it('never reaches another owner’s rows, whatever the filter says', async () => {
    const theirs = dump()
    const forged = { ...EXPENSES, owner: OTHER } as TxnFilter

    await edit(forged, 6, { description: 'Mine now' }).catch((e: unknown) => e)
    await edit(EXPENSES, 6, { description: 'Mine now' })

    const rows = ledger.db.prepare("SELECT owner, description FROM transactions WHERE description = 'Mine now'").all() as Array<{ owner: string }>
    expect(rows).toHaveLength(6)
    expect(new Set(rows.map((r) => r.owner))).toEqual(new Set([OWNER]))
    const after = dump() as { transactions: Array<{ owner: string }> }
    expect(after.transactions.filter((t) => t.owner === OTHER)).toEqual(
      (theirs as typeof after).transactions.filter((t) => t.owner === OTHER),
    )
  })

  it('counts only the owner’s rows, so a count taken from another owner’s view is refused', async () => {
    await expect(edit(EXPENSES, 12, { description: 'x' })).rejects.toMatchObject({ status: 409 })
    await expect(edit(EXPENSES, 6, { description: 'x' }, OTHER)).resolves.toEqual({ updated: 6 })

    expect(idsWhere(ledger.db, "owner = ? AND description = 'x'", OWNER)).toEqual([])
    expect(idsWhere(ledger.db, "owner = ? AND description = 'x'", OTHER)).toHaveLength(6)
  })
})

describe('the cap', () => {
  /** A ledger of `rows` August expenses and one September one, ids from 10,000. */
  function bigLedger(rows: number): void {
    const small = smallLedger(0)
    small.db.exec('BEGIN')
    const insert = small.db.prepare(
      `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
       VALUES (?,?,?,?,?,?,?,'expense',100,0)`,
    )
    for (let i = 0; i < rows; i += 1) insert.run(OWNER, 10_000 + i, '2026-08-10', '2026-08', `Bulk ${i}`, A.account, A.food)
    insert.run(OWNER, 10_000 + rows, '2026-09-10', '2026-09', 'September', A.account, A.food)
    small.db.exec('COMMIT')
    ledger = small
    useDatabase(small.d1)
  }

  it('edits exactly the cap’s worth of rows in one request, inside D1’s 100 bound values', async () => {
    bigLedger(MAX_FILTER_EDIT_ROWS)

    const result = await edit({ month: '2026-08' }, MAX_FILTER_EDIT_ROWS, { categoryId: A.travel })

    expect(result).toEqual({ updated: MAX_FILTER_EDIT_ROWS })
    expect(idsWhere(ledger.db, 'category_id = ? AND owner = ?', A.travel, OWNER)).toHaveLength(MAX_FILTER_EDIT_ROWS)
  })

  it('refuses one row more with a 400, rather than editing the first rows it finds', async () => {
    bigLedger(MAX_FILTER_EDIT_ROWS + 1)
    const before = ledger.db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?').get(A.travel)

    await expect(edit({ month: '2026-08' }, MAX_FILTER_EDIT_ROWS, { categoryId: A.travel })).rejects.toMatchObject({
      status: 400,
      message: bulkTooManyMessage(),
    })

    expect(ledger.db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?').get(A.travel)).toEqual(before)
  })

  it('reads one row past the cap to know, not the whole ledger', async () => {
    bigLedger(MAX_FILTER_EDIT_ROWS + 500)
    let returned = 0
    useDatabase({
      prepare: (sql: string) => {
        const statement = ledger.d1.prepare(sql)
        if (!sql.startsWith('SELECT t.id')) return statement
        return {
          bind: (...values: unknown[]) => {
            const bound = statement.bind(...values)
            return { all: async () => {
              const out = await bound.all()
              returned = out.results.length
              return out
            } }
          },
        }
      },
      batch: ledger.d1.batch.bind(ledger.d1),
    } as unknown as D1Database)

    await edit({ month: '2026-08' }, 1, { categoryId: A.travel }).catch(() => undefined)

    expect(returned).toBe(MAX_FILTER_EDIT_ROWS + 1)
  })
})
