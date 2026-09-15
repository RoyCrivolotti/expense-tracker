import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import { groupTransactionsByFlag } from '../engine/flagGroups'
import { buildReimbursementDraft } from '../engine/reimbursementDraft'
import { EU_MONEY_FORMAT } from '../engine/money'
import { buildSettledReport, reportReference } from '../engine/expenseReport'
import { listPastReports } from '../engine/pastReports'
import { buildBatchTransactions } from '../../ui/components/batchTransactionIntent'
import { buildReimbursementLinks } from '../engine/reimbursementLinks'
import { bulkUpdateTransactions } from './transactionService'

const OWNER = 'owner@example.com'

function repoWithClaim() {
  return inMemoryExpenseRepository(
    {
      accounts: [{ id: 1, name: 'Cash', kind: 'debit', settlement: 'immediate', active: true }],
      categories: [{ id: 2, name: 'Travel', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
      flags: [{ id: 4, name: 'Work travel', color: '#6366f1', reimbursable: true, sortOrder: 0, active: true }],
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

/**
 * Paid in instalments.
 *
 * The case the row-based model is built for and the one most likely to be got
 * wrong: an employer approves half a claim in June and the rest in July. Each
 * payment has to settle only its own rows, leave the remainder owed, and end up
 * as its own entry in Past reports.
 */
/**
 * The record of what was submitted, through the same repository the API routes use.
 *
 * Every other test here reads a report whose snapshot and live rows agree, and those
 * two are indistinguishable on screen: `listPastReports` falls back to the live rows
 * when there is no snapshot, so a matching pair proves only that one of the two paths
 * ran. Making them disagree is the only thing that shows which.
 */
describe('a past report after its rows are edited', () => {
  async function settledClaim() {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const hotel = await repo.insertTransaction(OWNER, line('Hotel', 4_000))
    const payment = await repo.insertTransaction(OWNER, reimbursement(14_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id, hotel.id], { settledBy: payment.id })
    return { repo, flight, hotel, payment }
  }

  const reportsOf = async (repo: ReturnType<typeof repoWithClaim>) => {
    const dataset = await repo.loadDataset(OWNER)
    return listPastReports(dataset.transactions, dataset.flags)
  }

  it('records what it covered when the settle lands', async () => {
    const { repo } = await settledClaim()

    const [report] = await reportsOf(repo)
    expect(report?.count).toBe(2)
    expect(report?.coveredCents).toBe(14_000)
    expect(report?.drifted).toBe(false)
  })

  it('keeps the submitted figures when a covered row is edited afterwards', async () => {
    const { repo, flight } = await settledClaim()

    await repo.updateTransaction(OWNER, flight.id, { amountCents: 100 })

    const [report] = await reportsOf(repo)
    expect(report?.coveredCents).toBe(14_000)
    expect(report?.count).toBe(2)
    expect(report?.drifted).toBe(true)
  })

  it('keeps them when a covered row is deleted afterwards', async () => {
    const { repo, hotel } = await settledClaim()

    await repo.deleteTransaction(OWNER, hotel.id)

    const [report] = await reportsOf(repo)
    expect(report?.count).toBe(2)
    expect(report?.coveredCents).toBe(14_000)
    expect(report?.remaining).toBe(1)
    expect(report?.drifted).toBe(true)
  })

  it('survives every covered row being deleted, with nothing left to rebuild from', async () => {
    const { repo, flight, hotel } = await settledClaim()

    await repo.deleteTransaction(OWNER, flight.id)
    await repo.deleteTransaction(OWNER, hotel.id)

    const [report] = await reportsOf(repo)
    expect(report?.count).toBe(2)
    expect(report?.coveredCents).toBe(14_000)
    expect(report?.remaining).toBe(0)
    expect(report?.drifted).toBe(true)
  })

  it('goes with the payment, so undoing the reimbursement undoes the record too', async () => {
    const { repo, payment } = await settledClaim()

    await repo.deleteTransaction(OWNER, payment.id)

    expect(await reportsOf(repo)).toEqual([])
  })
})

describe('a claim settled by two payments', () => {
  async function claimOfThree() {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const hotel = await repo.insertTransaction(OWNER, line('Hotel', 4_000))
    const dinner = await repo.insertTransaction(OWNER, line('Dinner', 2_000))
    return { repo, flight, hotel, dinner }
  }

  it('offers only the unpaid rows the second time round', async () => {
    const { repo, flight, hotel, dinner } = await claimOfThree()
    const first = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: first.id })

    const dataset = await repo.loadDataset(OWNER)
    const [group] = groupTransactionsByFlag(dataset.transactions, dataset.flags)
    const draft = buildReimbursementDraft(group!, dataset.accounts, 1)

    // The paid row must not be offered again, and the prefilled figure must be
    // the remainder rather than the original claim.
    expect(draft?.candidates.map((t) => t.id)).toEqual([hotel.id, dinner.id])
    expect(draft?.amountCents).toBe(6_000)
  })

  it('empties the card only once the last row is paid', async () => {
    const { repo, flight, hotel, dinner } = await claimOfThree()
    const first = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: first.id })
    const second = await repo.insertTransaction(OWNER, reimbursement(6_000))
    await bulkUpdateTransactions(repo, OWNER, [hotel.id, dinner.id], { settledBy: second.id })

    const dataset = await repo.loadDataset(OWNER)
    expect(groupTransactionsByFlag(dataset.transactions, dataset.flags)).toEqual([])
  })

  it('keeps the two payments as separate reports, each covering its own rows', async () => {
    const { repo, flight, hotel, dinner } = await claimOfThree()
    const first = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: first.id })
    const second = await repo.insertTransaction(OWNER, {
      ...reimbursement(6_000),
      date: '2026-07-14',
      budgetMonth: '2026-07',
    })
    await bulkUpdateTransactions(repo, OWNER, [hotel.id, dinner.id], { settledBy: second.id })

    const dataset = await repo.loadDataset(OWNER)
    const past = listPastReports(dataset.transactions, dataset.flags)

    // Newest first, like the rest of the app: July's payment leads.
    expect(past).toHaveLength(2)
    expect(past.map((r) => r.count)).toEqual([2, 1])
    expect(past.map((r) => r.coveredCents)).toEqual([6_000, 10_000])

    const reprint = buildSettledReport(second.id, dataset.transactions, dataset.flags, [])
    expect(reprint?.lines.map((l) => l.transaction.id)).toEqual([hotel.id, dinner.id])
    expect(reprint?.totalClaimedCents).toBe(6_000)
  })

  it('undoing the first payment leaves the second one intact', async () => {
    // Deleting a reimbursement clears settled_by for the rows it covered. That
    // must be scoped to *its* rows: a blanket clear would silently reopen a
    // claim that was already paid.
    const { repo, flight, hotel, dinner } = await claimOfThree()
    const first = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: first.id })
    const second = await repo.insertTransaction(OWNER, reimbursement(6_000))
    await bulkUpdateTransactions(repo, OWNER, [hotel.id, dinner.id], { settledBy: second.id })

    await repo.deleteTransaction(OWNER, first.id)

    const dataset = await repo.loadDataset(OWNER)
    const [group] = groupTransactionsByFlag(dataset.transactions, dataset.flags)
    expect(group?.transactions.map((t) => t.id)).toEqual([flight.id])
    expect(listPastReports(dataset.transactions, dataset.flags)).toHaveLength(1)
  })
})

/**
 * The bulk-add path, which is how a trip is actually entered: twelve rows in one
 * go with one flag on the form, then claimed and settled like anything else.
 */
describe('a claim entered through bulk add', () => {
  it('flags every row, then claims and settles them as one', async () => {
    const repo = repoWithClaim()
    const row = (id: string, amount: string, description: string) => ({
      id,
      type: 'expense' as const,
      amount,
      description,
      categoryId: 2,
      accountId: 1,
    })
    const built = buildBatchTransactions(
      [{ id: 'a', date: '2026-05-02', rows: [row('r1', '100', 'Flight'), row('r2', '40', 'Hotel')] }],
      EU_MONEY_FORMAT,
      1,
      // The form-level flag: "flag this whole trip".
      4,
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return

    const saved = []
    for (const input of built.transactions) saved.push(await repo.insertTransaction(OWNER, input))

    const dataset = await repo.loadDataset(OWNER)
    const [group] = groupTransactionsByFlag(dataset.transactions, dataset.flags)

    expect(group?.count).toBe(2)
    expect(group?.totalCents).toBe(14_000)

    const payment = await repo.insertTransaction(OWNER, reimbursement(14_000))
    await bulkUpdateTransactions(repo, OWNER, saved.map((t) => t.id), { settledBy: payment.id })

    const after = await repo.loadDataset(OWNER)
    expect(groupTransactionsByFlag(after.transactions, after.flags)).toEqual([])
    expect(listPastReports(after.transactions, after.flags)[0]?.count).toBe(2)
  })
})

/**
 * Deleting the flag afterwards.
 *
 * `deleteFlag` clears `flag_id` from every row it owns, settled ones included,
 * so a past report loses the only thing that used to give it a header. The row
 * stays in Past reports either way — that list is built from `settledBy` — so
 * the report behind it has to still open.
 */
/**
 * The ownership and conflict guards on settledBy, exercised against the
 * in-memory double directly (this is the only suite that runs against it).
 * Mirrors the D1 adapter's assertOwnedTransaction + settled-elsewhere checks
 * in functions/_shared/dbWrite.ts.
 */
describe('settledBy ownership and conflict guards', () => {
  it('rejects a settledBy that does not belong to this owner', async () => {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))

    await expect(
      bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: 9999 }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid settledBy' })
  })

  it('rejects settling a row already settled by a different payment, leaving the whole selection untouched', async () => {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const hotel = await repo.insertTransaction(OWNER, line('Hotel', 4_000))
    const firstPayment = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: firstPayment.id })

    const secondPayment = await repo.insertTransaction(OWNER, reimbursement(4_000))
    // hotel is free, but flight is already settled by the first payment — the
    // whole batch must be rejected, not half-applied.
    await expect(
      bulkUpdateTransactions(repo, OWNER, [flight.id, hotel.id], {
        settledBy: secondPayment.id,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Transaction is already settled by another reimbursement',
    })

    const dataset = await repo.loadDataset(OWNER)
    const flightAfter = dataset.transactions.find((t) => t.id === flight.id)
    const hotelAfter = dataset.transactions.find((t) => t.id === hotel.id)
    // Neither row in the selection was mutated: flight is still settled by the
    // first payment, and hotel — which on its own would have been free to
    // settle — was not settled by the second either.
    expect(flightAfter?.settledBy).toBe(firstPayment.id)
    expect(hotelAfter?.settledBy).toBeUndefined()
  })
})

describe('a past report whose flag has been deleted', () => {
  it('still rebuilds, headed by the name the payment was given', async () => {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const payment = await repo.insertTransaction(OWNER, {
      ...reimbursement(10_000),
      description: 'Madrid trip, May',
    })
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: payment.id })
    await repo.deleteFlag(OWNER, 4)

    const dataset = await repo.loadDataset(OWNER)
    const report = buildSettledReport(payment.id, dataset.transactions, dataset.flags, [])

    expect(report).not.toBeNull()
    expect(report?.flag.name).toBe('Madrid trip, May')
    expect(report?.lines.map((l) => l.transaction.id)).toEqual([flight.id])
    expect(report?.totalClaimedCents).toBe(10_000)
    // The reference is the one casualty: its initials come from the flag's name,
    // which is gone. Documented on standInFlag rather than silently different.
    expect(reportReference(report!)).toBe('MTM-202605')
  })

  it('leaves the row listed in Past reports, so the button has something to open', async () => {
    const repo = repoWithClaim()
    const flight = await repo.insertTransaction(OWNER, line('Flight', 10_000))
    const payment = await repo.insertTransaction(OWNER, reimbursement(10_000))
    await bulkUpdateTransactions(repo, OWNER, [flight.id], { settledBy: payment.id })
    await repo.deleteFlag(OWNER, 4)

    const dataset = await repo.loadDataset(OWNER)
    const past = listPastReports(dataset.transactions, dataset.flags)

    expect(past).toHaveLength(1)
    expect(past[0]?.flag).toBeUndefined()
    expect(past[0]?.count).toBe(1)
  })
})
