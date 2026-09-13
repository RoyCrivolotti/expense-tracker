import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import { groupTransactionsByFlag } from '../engine/flagGroups'
import { buildReimbursementLinks } from '../engine/reimbursementLinks'
import { bulkUpdateTransactions } from './transactionService'

const OWNER = 'owner@example.com'

function repoWithClaim() {
  return inMemoryExpenseRepository(
    {
      accounts: [{ id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true }],
      categories: [{ id: 2, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      flags: [{ id: 4, name: 'Work travel', color: '#6366f1', sortOrder: 0, active: true }],
    },
    OWNER,
  )
}

const line = (description: string, amountCents: number) => ({
  date: '2026-05-02',
  budgetMonth: '2026-05',
  description,
  accountId: 1,
  categoryId: 2,
  type: 'expense' as const,
  amountCents,
  cancelled: false,
  flagId: 4,
})

/**
 * The payment carries **no flag**. The rows it settles leave the card on their
 * own; a flagged refund would net against what is left as well, so the claim
 * would read as over-paid by its own settlement.
 */
const reimbursement = (amountCents: number) => ({
  date: '2026-06-14',
  budgetMonth: '2026-06',
  description: 'Reimbursement — Work travel',
  accountId: 1,
  categoryId: 2,
  type: 'refund' as const,
  amountCents,
  cancelled: false,
})

/**
 * The whole loop, through the same repository the API routes use: claim three
 * things, get paid for two, and check the card, the link and the undo.
 */
describe('recording a reimbursement, end to end', () => {
  it('takes the paid rows out of the claim and leaves the rest owed', async () => {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const hotel = await repo.insertTransaction(OWNER, line('Hotel', 4_000))
    const dinner = await repo.insertTransaction(OWNER, line('Dinner', 2_000))

    const payment = await repo.insertTransaction(OWNER, reimbursement(14_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id, hotel.id], { settledBy: payment.id })

    const dataset = await repo.loadDataset(OWNER)
    const groups = groupTransactionsByFlag(dataset.transactions, dataset.flags)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.transactions.map((t) => t.description)).toEqual(['Dinner'])
    expect(groups[0]?.totalCents).toBe(2_000)
    expect(dinner.id).toBeDefined()
  })

  it('links the payment and what it covered, both ways', async () => {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const payment = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: payment.id })

    const dataset = await repo.loadDataset(OWNER)
    const links = buildReimbursementLinks(dataset.transactions)

    expect(links.settlementFor(flight.id)?.id).toBe(payment.id)
    expect(links.settledBy(payment.id).map((t) => t.id)).toEqual([flight.id])
  })

  it('puts the rows back when the payment is deleted', async () => {
    // The inverse has to hold, or a mistaken reimbursement silently writes the
    // claim off: the rows would be neither owed nor reimbursed.
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const payment = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: payment.id })

    await repo.deleteTransaction(OWNER, payment.id)

    const dataset = await repo.loadDataset(OWNER)
    const groups = groupTransactionsByFlag(dataset.transactions, dataset.flags)
    expect(groups[0]?.transactions.map((t) => t.id)).toEqual([flight.id])
  })

  it('keeps the flag on a settled row, so the claim stays answerable', async () => {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const payment = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: payment.id })

    const dataset = await repo.loadDataset(OWNER)
    const settled = dataset.transactions.find((t) => t.id === flight.id)

    expect(settled?.flagId).toBe(4)
    expect(settled?.settledBy).toBe(payment.id)
  })
})
