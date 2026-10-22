import { beforeEach, describe, expect, it } from 'vitest'
import {
  BULK_CHANGED_MESSAGE,
  MAX_BULK_LABEL_LINKS,
  MAX_FILTER_EDIT_ROWS,
  bulkCountMessage,
  bulkTooManyLinksMessage,
  bulkTooManyMessage,
} from '../domain/data/bulkEdit'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { inMemoryExpenseRepository } from '../../src/testing/inMemoryExpenseRepository'
import {
  OTHER,
  OTHER_IDS,
  OWNER,
  OWNER_IDS,
  beforeEachBatch,
  smallLedger,
  type SmallLedger,
} from '../../src/testing/smallLedgerDb'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { loadDataset } from './db'
import type { Env } from './env'

/**
 * Adding labels to many rows in one request: a union with the labels the rows have, one atomic batch, the
 * owner's rows only. Real SQLite with the real migrations, which refuses more than 100 bound values.
 */

const A = OWNER_IDS
const B = OTHER_IDS

let ledger: SmallLedger
let repo: ExpenseRepository

function useDatabase(d1: D1Database): void {
  repo = createD1ExpenseRepository({ DB: d1 } as Env)
}

beforeEach(() => {
  ledger = smallLedger(6)
  useDatabase(ledger.d1)
})

const linksOf = (id: number): number[] =>
  (ledger.db.prepare('SELECT label_id FROM transaction_labels WHERE transaction_id = ? ORDER BY label_id').all(id) as Array<{ label_id: number }>).map(
    (r) => r.label_id,
  )

const allLinks = (): unknown =>
  ledger.db.prepare('SELECT transaction_id, label_id FROM transaction_labels ORDER BY transaction_id, label_id').all()

describe('adding labels by ids', () => {
  it('gives every row the labels and keeps the ones it had', async () => {
    ledger.db.prepare('INSERT INTO transaction_labels (transaction_id, label_id) VALUES (2, ?)').run(A.autoLabel)

    const result = await repo.addLabelsToTransactions(OWNER, { ids: [1, 2, 3] }, [A.label])

    expect(result).toEqual({ matched: 3, added: 3 })
    expect(linksOf(1)).toEqual([A.label])
    expect(linksOf(2)).toEqual([A.label, A.autoLabel])
    expect(linksOf(4)).toEqual([])
  })

  it('adds nothing, and says so, to rows that already have the labels', async () => {
    await repo.addLabelsToTransactions(OWNER, { ids: [1, 2] }, [A.label, A.autoLabel])

    const again = await repo.addLabelsToTransactions(OWNER, { ids: [1, 2, 3] }, [A.label, A.autoLabel])

    expect(again).toEqual({ matched: 3, added: 2 })
    expect(linksOf(3)).toEqual([A.label, A.autoLabel])
  })

  it('counts a row that is not the owner’s or is not there as unmatched, and labels it with nothing', async () => {
    const before = allLinks()

    const result = await repo.addLabelsToTransactions(OWNER, { ids: [B.first, 99_999] }, [A.label])

    expect(result).toEqual({ matched: 0, added: 0 })
    expect(allLinks()).toEqual(before)
  })

  it('refuses a label that is not the owner’s, and changes nothing', async () => {
    const before = allLinks()

    await expect(repo.addLabelsToTransactions(OWNER, { ids: [1, 2] }, [A.label, B.label])).rejects.toMatchObject({
      status: 400,
      message: 'Invalid labelId',
    })

    expect(allLinks()).toEqual(before)
  })

  it('does not label another owner’s row with the owner’s label, even when both are named', async () => {
    const result = await repo.addLabelsToTransactions(OWNER, { ids: [1, B.first] }, [A.label])

    expect(result).toEqual({ matched: 1, added: 1 })
    expect(linksOf(B.first)).toEqual([])
  })

  it('refuses more links than the cap in one request', async () => {
    const ids = Array.from({ length: MAX_BULK_LABEL_LINKS + 1 }, (_, i) => i + 1)

    await expect(repo.addLabelsToTransactions(OWNER, { ids }, [A.label])).rejects.toMatchObject({
      status: 400,
      message: bulkTooManyLinksMessage(),
    })
  })

  it('puts the labels in one batch of two statements: the insert, and the count of rows reached', async () => {
    const sizes: number[] = []
    useDatabase({
      prepare: ledger.d1.prepare.bind(ledger.d1),
      batch: (statements: Parameters<D1Database['batch']>[0]) => {
        sizes.push(statements.length)
        return ledger.d1.batch(statements)
      },
    } as unknown as D1Database)

    await repo.addLabelsToTransactions(OWNER, { ids: [1, 2, 3] }, [A.label, A.autoLabel])

    expect(sizes).toEqual([2])
  })
})

describe('adding labels by filter', () => {
  const august = { filter: { type: 'expense' as const, month: '2026-08' }, expectedCount: 2 }

  it('labels the rows the filter matches and no others', async () => {
    const result = await repo.addLabelsToTransactions(OWNER, august, [A.label])

    expect(result).toEqual({ matched: 2, added: 2 })
    expect([1, 2, 3, 4, 5, 6].filter((id) => linksOf(id).length > 0)).toEqual([1, 4])
  })

  it.each([1, 3])('answers 409 when %i rows were shown and two match', async (shown) => {
    const before = allLinks()

    await expect(
      repo.addLabelsToTransactions(OWNER, { ...august, expectedCount: shown }, [A.label]),
    ).rejects.toMatchObject({ status: 409, message: bulkCountMessage(2, shown) })

    expect(allLinks()).toEqual(before)
  })

  it('writes nothing when a row joins the filter between finding the rows and writing', async () => {
    useDatabase(
      beforeEachBatch(ledger.d1, () =>
        ledger.db
          .prepare(
            `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
             VALUES (?,80,'2026-08-20','2026-08','Late',?,?,'expense',900,0)`,
          )
          .run(OWNER, A.account, A.food),
      ),
    )
    const before = allLinks()

    await expect(repo.addLabelsToTransactions(OWNER, august, [A.label])).rejects.toMatchObject({
      status: 409,
      message: BULK_CHANGED_MESSAGE,
    })

    expect(allLinks()).toEqual(before)
  })

  it('reaches only the owner’s rows when the other owner has rows that look the same', async () => {
    const result = await repo.addLabelsToTransactions(OTHER, { filter: august.filter, expectedCount: 2 }, [B.label])

    expect(result).toEqual({ matched: 2, added: 2 })
    expect(linksOf(1)).toEqual([])
    expect(linksOf(B.first)).toEqual([B.label])
  })

  it('refuses a filter that reaches more rows than the cap, whatever the labels', async () => {
    const big = smallLedger(0)
    big.db.exec('BEGIN')
    const insert = big.db.prepare(
      `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
       VALUES (?,?,'2026-08-10','2026-08','Bulk',?,?,'expense',100,0)`,
    )
    for (let i = 0; i <= MAX_FILTER_EDIT_ROWS; i += 1) insert.run(OWNER, 10_000 + i, A.account, A.food)
    big.db.exec('COMMIT')
    useDatabase(big.d1)

    await expect(
      repo.addLabelsToTransactions(OWNER, { filter: { month: '2026-08' }, expectedCount: MAX_FILTER_EDIT_ROWS }, [A.label]),
    ).rejects.toMatchObject({ status: 400, message: bulkTooManyMessage() })
    const linked = (big.db.prepare('SELECT COUNT(*) AS n FROM transaction_labels').get() as { n: number }).n
    expect(linked).toBe(0)
  })

  it('labels exactly the cap’s worth of rows with one label in one request', async () => {
    const big = smallLedger(0)
    big.db.exec('BEGIN')
    const insert = big.db.prepare(
      `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
       VALUES (?,?,'2026-08-10','2026-08','Bulk',?,?,'expense',100,0)`,
    )
    for (let i = 0; i < MAX_FILTER_EDIT_ROWS; i += 1) insert.run(OWNER, 10_000 + i, A.account, A.food)
    big.db.exec('COMMIT')
    useDatabase(big.d1)

    const result = await repo.addLabelsToTransactions(
      OWNER,
      { filter: { month: '2026-08' }, expectedCount: MAX_FILTER_EDIT_ROWS },
      [A.label],
    )

    expect(result).toEqual({ matched: MAX_FILTER_EDIT_ROWS, added: MAX_FILTER_EDIT_ROWS })
  })
})

describe('the in-memory repository does the same', () => {
  async function inMemory(): Promise<ExpenseRepository> {
    const env = { DB: ledger.d1 } as Env
    const served = await loadDataset(env, OWNER)
    return inMemoryExpenseRepository(served, OWNER)
  }

  it('for ids and for a filter, down to the counts it answers with', async () => {
    const memory = await inMemory()
    const filter = { type: 'expense' as const, month: '2026-09' }
    const steps: Array<[Parameters<ExpenseRepository['addLabelsToTransactions']>[1], number[]]> = [
      [{ ids: [1, 2, 3] }, [A.label]],
      [{ ids: [2, 3, 4] }, [A.label, A.autoLabel]],
      [{ filter, expectedCount: 4 }, [A.autoLabel]],
      [{ ids: [B.first, 99_999] }, [A.label]],
    ]

    for (const [target, labels] of steps) {
      expect(await memory.addLabelsToTransactions(OWNER, target, labels)).toEqual(
        await repo.addLabelsToTransactions(OWNER, target, labels),
      )
    }

    const sql = (await loadDataset({ DB: ledger.d1 } as Env, OWNER)).transactions
    const mem = (await memory.loadDataset(OWNER)).transactions
    const labelsOf = (rows: typeof sql) => rows.map((t) => [t.id, [...(t.labelIds ?? [])].sort()])
    expect(labelsOf(mem)).toEqual(labelsOf(sql))
  })

  it('and refuses what the SQL refuses', async () => {
    const memory = await inMemory()

    await expect(memory.addLabelsToTransactions(OWNER, { ids: [1] }, [B.label])).rejects.toMatchObject({ status: 400 })
    await expect(
      memory.addLabelsToTransactions(OWNER, { filter: { type: 'expense' }, expectedCount: 1 }, [A.label]),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      memory.addLabelsToTransactions(OWNER, { ids: Array.from({ length: MAX_BULK_LABEL_LINKS + 1 }, (_, i) => i + 1) }, [A.label]),
    ).rejects.toMatchObject({ status: 400 })
  })
})
