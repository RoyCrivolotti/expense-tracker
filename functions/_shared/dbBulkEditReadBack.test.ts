// @vitest-environment node
/**
 * An edit by ids answers with the rows it edited. They used to be read back one at a time, three queries a row, so
 * the cost of an edit grew with the number of ids; they are now one read with the status and the label ids derived in
 * SQL as the list derives them. These hold the answer to the one the per-row read gives on random ledgers and random
 * edits, and the number of statements to a constant.
 */
import { describe, expect, it } from 'vitest'
import type { BulkTransactionPatch } from '../domain/data/dataSource'
import { mulberry32 } from '../domain/engine/rng'
import type { Transaction } from '../domain/types'
import { randomLedger } from '../../src/testing/randomLedger'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, queryDb } from '../../src/testing/transactionQueryKit'
import { bulkUpdateTransactions, deriveOne } from './dbWrite'
import type { Env } from './env'
import { HttpError } from './http'
import { idList, IN_ID_LIST } from './sqlIdList'
import { toStoredTxn, type TxnRow } from './rows'

/** What the edit used to answer with: each row read back and derived on its own. */
async function perRow(env: Env, ids: number[]): Promise<Transaction[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM transactions WHERE owner = ? AND id ${IN_ID_LIST}`)
    .bind(OWNER, idList(ids))
    .all<TxnRow>()
  const rows: Transaction[] = []
  for (const row of results) rows.push(await deriveOne(env, OWNER, toStoredTxn(row)))
  return rows
}

/** Label ids in ascending order, as the dataset carries them, and rows in id order. */
const normalised = (rows: Transaction[]): Transaction[] =>
  rows.map((t) => ({ ...t, labelIds: [...(t.labelIds ?? [])].sort((a, b) => a - b) })).sort((a, b) => a.id - b.id)

describe('an edit by ids answers with the rows it edited', () => {
  it('as the per-row read-back did, over random ledgers and random edits', async () => {
    let edits = 0
    const statuses = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      const rnd = mulberry32(seed * 7919)
      const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)] as T
      const ledger = randomLedger(seed)
      if (ledger.transactions.length === 0) continue
      const kit = queryDb(ledger, [{ owner: OTHER_OWNER, dataset: randomLedger(seed + 100) }])
      const env = { DB: kit.d1 } as Env
      const mine = ledger.transactions.map((t) => t.id)
      const theirs = (kit.sqlite.prepare('SELECT id FROM transactions WHERE owner = ? LIMIT 3').all(OTHER_OWNER) as Array<{ id: number }>).map((r) => r.id)
      const patches: BulkTransactionPatch[] = [
        ...(ledger.categories.length ? [{ categoryId: pick(ledger.categories).id }] : []),
        ...(ledger.accounts.length ? [{ accountId: pick(ledger.accounts).id }] : []),
        { type: pick(['expense', 'income', 'refund'] as const) },
        { date: '2026-03-05', budgetMonth: '2026-03' },
        { flagId: ledger.flags.length ? pick([...ledger.flags.map((f) => f.id), null]) : null },
        { description: `Edited ${seed}` },
      ]
      for (const patch of patches) {
        const ids = [...new Set([...Array.from({ length: 1 + Math.floor(rnd() * 30) }, () => pick(mine)), 999_999, ...theirs.slice(0, 1)])]
        let answer: Transaction[]
        try {
          answer = await bulkUpdateTransactions(env, OWNER, ids, patch)
        } catch (error) {
          if (error instanceof HttpError) continue
          throw error
        }
        edits += 1
        for (const t of answer) statuses.add(t.status)
        expect(normalised(answer), `seed ${seed}, ${JSON.stringify(patch)}`).toEqual(normalised(await perRow(env, ids)))
        expect(answer.map((t) => t.id)).toEqual(answer.map((t) => t.id).sort((a, b) => a - b))
        expect(answer.every((t) => mine.includes(t.id))).toBe(true)
      }
    }
    expect(edits).toBeGreaterThan(80)
    expect(statuses.size).toBeGreaterThan(1)
  }, 120_000)

  it('is empty for ids that are none of the owner’s', async () => {
    const kit = queryDb(randomLedger(3), [{ owner: OTHER_OWNER, dataset: randomLedger(4) }])
    const foreign = (kit.sqlite.prepare('SELECT id FROM transactions WHERE owner = ? LIMIT 2').all(OTHER_OWNER) as Array<{ id: number }>).map((r) => r.id)

    await expect(bulkUpdateTransactions({ DB: kit.d1 } as Env, OWNER, [...foreign, 999_999], { description: 'No' })).resolves.toEqual([])
  })
})

describe('the cost of an edit by ids', () => {
  it('is the same handful of statements whether it edits 1 row or 500', async () => {
    const kit = queryDb(syntheticLedger({ months: 12, perMonth: 60, seed: 5 }))
    const env = { DB: kit.d1 } as Env
    const all = (kit.sqlite.prepare('SELECT id FROM transactions WHERE owner = ? ORDER BY id').all(OWNER) as Array<{ id: number }>).map((r) => r.id)
    expect(all.length).toBeGreaterThan(500)

    const counts: Record<number, number> = {}
    for (const n of [1, 25, 100, 500]) {
      kit.statements.length = 0
      const answer = await bulkUpdateTransactions(env, OWNER, all.slice(0, n), { description: `Edited ${n}` })
      counts[n] = kit.statements.length
      expect(answer).toHaveLength(n)
    }

    expect(new Set(Object.values(counts)).size, JSON.stringify(counts)).toBe(1)
    expect(counts[500]).toBeLessThanOrEqual(12)
  })

  it('reads the rows back in one statement', async () => {
    const kit = queryDb(syntheticLedger({ months: 3, perMonth: 30, seed: 6 }))
    const ids = (kit.sqlite.prepare('SELECT id FROM transactions WHERE owner = ? LIMIT 40').all(OWNER) as Array<{ id: number }>).map((r) => r.id)

    kit.statements.length = 0
    await bulkUpdateTransactions({ DB: kit.d1 } as Env, OWNER, ids, { description: 'Edited' })

    expect(kit.statements.filter((s) => s.sql.includes('json_group_array'))).toHaveLength(1)
    expect(kit.statements.filter((s) => /FROM account_statements WHERE account_id/.test(s.sql))).toEqual([])
  })
})
