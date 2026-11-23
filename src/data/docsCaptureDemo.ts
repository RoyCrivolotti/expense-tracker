/**
 * The demo data the docs gallery and DOCS_CAPTURE dev add to the fixture: an installment plan, flags with a receipt,
 * paid card statements and counted cash. Only `docsCaptureDataSource` reads it.
 */
import type {
  AccountStatement,
  CashActual,
  ExpenseDataset,
  Flag,
  InstallmentPlan,
  StoredTransaction,
  TransactionAttachment,
} from '../types'
import { deriveTransactions } from '../domain/engine/status'
import { computeCashReconciliation } from '../domain/engine/cashReconciliation'

/** A demo installment plan (part-paid) for the gallery, if a category exists. */
function demoInstallments(dataset: ExpenseDataset): {
  plans: InstallmentPlan[]
  transactions: StoredTransaction[]
} {
  const account = dataset.accounts.find((a) => a.active)
  const category = dataset.categories[0]
  if (!account || !category) return { plans: [], transactions: [] }
  const plan: InstallmentPlan = {
    id: 980_001,
    description: 'iPhone 16 Pro',
    totalCount: 12,
    amountCents: 8900,
    accountId: account.id,
    categoryId: category.id,
    type: 'expense',
    anchorBudgetMonth: '2026-01',
    startInstallmentIndex: 1,
    active: true,
  }
  const transactions: StoredTransaction[] = [1, 2, 3, 4].map((i) => ({
    id: 980_000 + i,
    date: `2026-0${i}-10`,
    budgetMonth: `2026-0${i}`,
    description: plan.description,
    accountId: account.id,
    categoryId: category.id,
    type: 'expense',
    amountCents: plan.amountCents,
    cancelled: false,
    planId: plan.id,
    installmentIndex: i,
  }))
  return { plans: [plan], transactions }
}

/**
 * Two demo flags with a few transactions on each, so the Flagged card and the
 * row markers are actually visible in the gallery and in DOCS_CAPTURE dev.
 */
function demoFlags(stored: StoredTransaction[]): {
  flags: Flag[]
  transactions: StoredTransaction[]
} {
  const flags: Flag[] = [
    {
      id: 970_001,
      name: 'Work travel',
      color: '#6366f1',
      description: 'Reimbursable — submit monthly',
      reimbursable: true,
      sortOrder: 0,
      active: true,
    },
    // Not reimbursable: a note for the accountant, not money anyone owes back.
    { id: 970_002, name: 'Tax deductible', color: '#10b981', reimbursable: false, sortOrder: 1, active: true },
  ]
  // Spread across the most recent rows so the card has something to total.
  const recent = [...stored].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const flagged = new Map<number, number>()
  recent.forEach((txn, i) => flagged.set(txn.id, i % 3 === 2 ? 970_002 : 970_001))
  // A business purpose on some rows, so the claim shows what it does with
  // the notes field rather than a column of blanks.
  const purposes = ['Kick-off with Acme', 'Client workshop, day 2', 'Airport transfer']
  const withFlags = stored.map((txn, i) => {
    const flagId = flagged.get(txn.id)
    if (flagId == null) return txn
    const purpose = purposes[i % purposes.length]
    return { ...txn, flagId, ...(purpose ? { notes: purpose } : {}) }
  })
  // One settled claim, modelled the way the app actually records one.
  //
  // The payment carries **no flag**. `recordReimbursement` deliberately creates
  // it unflagged — a flagged settlement would sit inside the very report it
  // settles, as a credit that makes the claim read as over-paid by its own
  // payment. The demo data used to flag it, which both contradicted the shipped
  // behaviour and drove the Work travel group's outstanding total negative,
  // hiding the Record reimbursement action it exists to demonstrate.
  //
  // The link is `settledBy` on the row it covers. That is also what makes Past
  // reports reachable at all: its trigger hides itself until a settlement
  // exists (`usePastReports.entry`).
  const workTravel = withFlags.filter((t) => t.flagId === 970_001 && t.type === 'expense')
  const claimed = recent[0]
  // Settle the cheapest row, so the group keeps a clearly positive outstanding
  // balance and still offers to settle the rest.
  const settled = [...workTravel].sort((a, b) => a.amountCents - b.amountCents)[0]
  if (!claimed || !settled) return { flags, transactions: withFlags }
  return {
    flags,
    transactions: [
      ...withFlags.map((t) => (t.id === settled.id ? { ...t, settledBy: 970_500 } : t)),
      {
        id: 970_500,
        date: claimed.date,
        budgetMonth: claimed.budgetMonth,
        description: 'Alicante trip, June',
        accountId: claimed.accountId,
        categoryId: claimed.categoryId,
        type: 'refund' as const,
        // Matches what it settles, so the Past reports row reconciles.
        amountCents: settled.amountCents,
        cancelled: false,
        // The stamp the settle writes (migration 0021). Set to what the one covered
        // row actually comes to, so the demo report shows as unchanged rather than
        // as one recorded before snapshots existed.
        reportCount: 1,
        reportCoveredCents: settled.amountCents,
      },
    ],
  }
}

/** Demo paid card statements + payment dates for gallery screenshots. */
export function enrichDocsCaptureDataset(dataset: ExpenseDataset): ExpenseDataset {
  const { plans, transactions: planTxns } = demoInstallments(dataset)
  const cards = dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active)

  const accountStatements: AccountStatement[] = []
  for (const card of cards) {
    accountStatements.push(
      { accountId: card.id, yearMonth: '2026-01', paid: true, paidOn: '2026-02-14' },
      { accountId: card.id, yearMonth: '2026-02', paid: true, paidOn: '2026-03-14' },
      { accountId: card.id, yearMonth: '2026-03', paid: true, paidOn: '2026-04-14' },
      // April budget settles mid-May — visible in May Transactions on paid date.
      { accountId: card.id, yearMonth: '2026-04', paid: true, paidOn: '2026-05-14' },
      // May budget settles mid-June — appears in June Transactions, not May.
      { accountId: card.id, yearMonth: '2026-05', paid: true, paidOn: '2026-06-14' },
      { accountId: card.id, yearMonth: '2026-06', paid: true, paidOn: '2026-07-14' },
      { accountId: card.id, yearMonth: '2026-07', paid: true, paidOn: '2026-08-14' },
      // August stays unpaid, so the Cash view has a live "waiting" month.
    )
  }
  const { flags, transactions: stored } = demoFlags([...dataset.transactions, ...planTxns])
  // One PDF receipt on a claimed row, so the expense report's Receipts section
  // renders at all in DOCS_CAPTURE. Deliberately a PDF and not a photo: the PDF
  // branch is the one that needs no bytes behind it, so it shows correctly with
  // no API, where an <img> would capture as a broken icon.
  const claimedRow = stored.find((t) => t.flagId === 970_001)
  const attachments: TransactionAttachment[] = claimedRow
    ? [
        {
          id: 970_900,
          transactionId: claimedRow.id,
          contentType: 'application/pdf',
          byteSize: 184_320,
          originalName: 'acme-invoice-4471.pdf',
          createdAt: `${claimedRow.date}T09:12:00.000Z`,
          hasThumb: false,
        },
      ]
    : []
  const settings = { ...dataset.settings, claimantName: 'Alex Moreno' }
  const transactions = deriveTransactions(stored, dataset.accounts, accountStatements)
  // Counted cash through June, taken from the engine's own expectation so the
  // amounts stay consistent with whatever the fixture adds up to, with a small
  // deliberate gap in May, so the drift story has something to show.
  const cashActuals: CashActual[] = computeCashReconciliation(transactions, dataset.accounts, settings, [])
    .filter((r) => r.month <= '2026-06')
    .map((r) => ({
      yearMonth: r.month,
      // The gap opens in May and carries over, as an unfound drift really would.
      actualCashCents: r.expectedCashCents + (r.month >= '2026-05' ? -1250 : 0),
    }))
  return {
    ...dataset,
    flags,
    attachments,
    // A claimant, so the claim's header renders as a real document rather
    // than an anonymous table.
    settings,
    accountStatements: cards.length > 0 ? accountStatements : dataset.accountStatements,
    cashActuals: cards.length > 0 ? cashActuals : dataset.cashActuals,
    installmentPlans: plans,
    transactions,
  }
}
