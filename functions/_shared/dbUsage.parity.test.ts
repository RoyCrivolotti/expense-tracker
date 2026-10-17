/**
 * The usage counts are held to the dataset the browser has today. For ledgers of every shape the kit has,
 * the counts the SQL serves are exactly what `usageFromDataset` computes from the dataset the API serves,
 * they agree with the counts the Settings lists compute from every row, and a record with a count of zero
 * is one the server lets be deleted outright while one with any count is not.
 */
import { describe, expect, it } from 'vitest'
import { usageFromDataset } from '../../src/domain/engine/recordUsage'
import type { ExpenseDataset } from '../../src/domain/types'
import { accountUsageCount, categoryUsageCount } from '../../src/ui/definitions/recordUsage'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { makeDataset, makeTransaction } from '../../src/testing/factories'
import { inMemoryExpenseRepository } from '../../src/testing/inMemoryExpenseRepository'
import { randomLedger } from '../../src/testing/randomLedger'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, awkwardLedger, queryDb } from '../../src/testing/transactionQueryKit'
import { syntheticAccounts, syntheticCategories, syntheticFlags, syntheticLabels } from '../../src/testing/syntheticReference'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { loadDataset } from './db'

async function served(dataset: ExpenseDataset) {
  const kit = queryDb(dataset)
  const env = { DB: kit.d1 }
  const repo = createD1ExpenseRepository(env)
  return { kit, repo, dataset: await loadDataset(env, OWNER), usage: await repo.readUsage(OWNER) }
}

describe('the counts the SQL serves equal the dataset’s', () => {
  it('on 80 seeded random ledgers, with flags, labels, plans, statements and rows that name an account that is gone', async () => {
    let withLabels = 0
    let withFlags = 0
    for (let seed = 0; seed < 80; seed += 1) {
      const { dataset, usage } = await served(randomLedger(seed))
      expect(usage, `seed ${seed}`).toEqual(usageFromDataset(dataset))
      if (usage.labels.some((l) => l.transactions > 0)) withLabels += 1
      if (usage.flags.some((f) => f.transactions > 0)) withFlags += 1
    }
    expect(withLabels).toBeGreaterThan(20)
    expect(withFlags).toBeGreaterThan(5)
  }, 60_000)

  it('on the adversarial ledger, a large regular one and the paged-read ledger', async () => {
    for (const ledger of [adversarialLedger(), syntheticLedger({ months: 36, perMonth: 25, seed: 4 }), awkwardLedger()]) {
      const { dataset, usage } = await served(ledger)
      expect(usage).toEqual(usageFromDataset(dataset))
      expect(usage.categories.some((c) => c.transactions > 0 && c.plans > 0)).toBe(true)
    }
  })

  it('and the in-memory repository answers the same', async () => {
    for (const ledger of [randomLedger(4), randomLedger(9), adversarialLedger()]) {
      const { kit, usage } = await served(ledger)
      const loaded = await loadDataset({ DB: kit.d1 }, OWNER)
      // The in-memory repository keeps label links apart from the rows.
      const transactionLabels = loaded.transactions.flatMap((t) => (t.labelIds ?? []).map((labelId) => ({ transactionId: t.id, labelId })))
      const memory = inMemoryExpenseRepository({ ...loaded, transactionLabels }, OWNER)
      expect(await memory.readUsage(OWNER)).toEqual(usage)
    }
  })

  it('and lists every record, with zero where nothing names it, in ascending order of id', async () => {
    const empty = makeDataset({ categories: syntheticCategories(), accounts: syntheticAccounts(), flags: syntheticFlags(), labels: syntheticLabels() })
    const { usage } = await served(empty)
    expect(usage.categories).toHaveLength(syntheticCategories().length)
    expect(usage.categories.every((c) => c.transactions === 0 && c.plans === 0)).toBe(true)
    expect(usage.accounts.every((a) => a.transactions === 0 && a.plans === 0 && a.statements === 0)).toBe(true)
    expect(usage.flags.map((f) => f.id)).toEqual(syntheticFlags().map((f) => f.id).sort((a, b) => a - b))
    for (const list of [usage.categories, usage.accounts, usage.flags, usage.labels]) {
      expect(list.map((r) => r.id)).toEqual(list.map((r) => r.id).sort((a, b) => a - b))
    }
  })
})

describe('the counts the Settings lists show today', () => {
  it('are the SQL’s: transactions of any status, plans and statements for an account, tagged rows for a flag or label', async () => {
    for (const ledger of [randomLedger(2), randomLedger(21), adversarialLedger()]) {
      const { dataset, usage } = await served(ledger)
      for (const c of usage.categories) expect(c.transactions + c.plans).toBe(categoryUsageCount(dataset, c.id))
      for (const a of usage.accounts) expect(a.transactions + a.plans + a.statements).toBe(accountUsageCount(dataset, a.id))
      for (const f of usage.flags) expect(f.transactions).toBe(dataset.transactions.filter((t) => t.flagId === f.id).length)
      for (const l of usage.labels) expect(l.transactions).toBe(dataset.transactions.filter((t) => t.labelIds?.includes(l.id)).length)
    }
  })

  it('count a cancelled row, which the lists do too', async () => {
    const cancelled = makeTransaction({ id: 1, categoryId: 1, accountId: 1, cancelled: true, createdAt: '2025-01-01T00:00:00Z' })
    const { usage } = await served(makeDataset({ categories: syntheticCategories(), accounts: syntheticAccounts(), transactions: [cancelled] }))
    expect(usage.categories.find((c) => c.id === 1)?.transactions).toBe(1)
    expect(usage.accounts.find((a) => a.id === 1)?.transactions).toBe(1)
  })
})

describe('delete against reassign', () => {
  it('goes the way the counts say: a record with none deletes, one with any is refused until its rows are moved', async () => {
    let checked = { unused: 0, used: 0 }
    for (const ledger of [randomLedger(5), randomLedger(17), randomLedger(33)]) {
      const probe = await served(ledger)
      const ofCategories = probe.usage.categories.map((c) => ({ kind: 'category' as const, id: c.id, used: c.transactions + c.plans > 0 }))
      const ofAccounts = probe.usage.accounts.map((a) => ({ kind: 'account' as const, id: a.id, used: a.transactions + a.plans + a.statements > 0 }))
      const sample = [...ofCategories, ...ofAccounts].filter((r, _i, all) => all.filter((x) => x.kind === r.kind && x.used === r.used).indexOf(r) < 2)
      for (const record of sample) {
        const { repo } = await served(ledger)
        const attempt = record.kind === 'category' ? repo.deleteCategory!(OWNER, record.id) : repo.deleteAccount!(OWNER, record.id)
        if (record.used) {
          await expect(attempt).rejects.toMatchObject({ status: 409 })
          checked = { ...checked, used: checked.used + 1 }
        } else {
          await expect(attempt).resolves.toBeDefined()
          checked = { ...checked, unused: checked.unused + 1 }
        }
      }
    }
    expect(checked.used).toBeGreaterThan(4)
    expect(checked.unused).toBeGreaterThan(0)
  }, 60_000)
})

describe('whose rows are counted', () => {
  it('are the owner’s only: another owner’s rows, plans and tags are never counted, even when they name this owner’s ids', async () => {
    const mine = makeDataset({
      categories: syntheticCategories(),
      accounts: syntheticAccounts(),
      flags: syntheticFlags(),
      labels: syntheticLabels(),
      transactions: [makeTransaction({ id: 1, categoryId: 1, accountId: 1, createdAt: '2025-01-01T00:00:00Z', labelIds: [1], flagId: 1 })],
    })
    const theirs = makeDataset({
      categories: syntheticCategories(),
      accounts: syntheticAccounts(),
      transactions: [2, 3, 4].map((id) => makeTransaction({ id, categoryId: 1, accountId: 1, createdAt: '2025-01-01T00:00:00Z', labelIds: [1], flagId: 1 })),
    })
    const kit = queryDb(mine, [{ owner: OTHER_OWNER, dataset: theirs }])
    // Their rows are given this owner's own ids to name, which the API never allows but a test can.
    kit.sqlite.exec(`UPDATE transactions SET category_id = 1, account_id = 1, flag_id = 1 WHERE owner = '${OTHER_OWNER}'`)
    kit.sqlite.exec(`INSERT INTO transaction_labels (transaction_id, label_id) SELECT id, 1 FROM transactions WHERE owner = '${OTHER_OWNER}'`)
    kit.sqlite.exec(
      `INSERT INTO installment_plans (id, owner, description, total_count, amount_cents, account_id, category_id, type, anchor_budget_month, start_installment_index, active)
       VALUES (900, '${OTHER_OWNER}', 'Their sofa', 3, 100, 1, 1, 'expense', '2026-01', 1, 1)`,
    )
    kit.sqlite.exec(`INSERT INTO account_statements (owner, account_id, year_month, paid) VALUES ('${OTHER_OWNER}', 1, '2026-01', 1)`)
    const repo = createD1ExpenseRepository({ DB: kit.d1 })
    const usage = await repo.readUsage(OWNER)
    expect(usage.categories.find((c) => c.id === 1)).toEqual({ id: 1, transactions: 1, plans: 0 })
    expect(usage.accounts.find((a) => a.id === 1)).toEqual({ id: 1, transactions: 1, plans: 0, statements: 0 })
    expect(usage.flags.find((f) => f.id === 1)).toEqual({ id: 1, transactions: 1 })
    expect(usage.labels.find((l) => l.id === 1)).toEqual({ id: 1, transactions: 1 })
    expect((await repo.readUsage(OTHER_OWNER)).categories).toHaveLength(syntheticCategories().length)
  })
})
