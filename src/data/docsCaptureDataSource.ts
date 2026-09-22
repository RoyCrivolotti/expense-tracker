/**
 * Read-only CSV data with canWrite enabled for README screenshot capture.
 * Mutations resolve immediately and are not persisted.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  Flag,
  ExpenseSettings,
  GoalScenario,
  InstallmentPlan,
  StoredTransaction,
  Transaction,
  TransactionAttachment,
  WealthAccount,
  WealthCheckin,
} from '../types'
import type {
  ExpenseDataSource,
  NewAccount,
  NewCategory,
  NewGoalScenario,
  NewInstallmentPlan,
  NewTransaction,
  NewWealthAccount,
  NewWealthCheckin,
} from './dataSource'
import { deriveTransactions } from '../domain/engine/status'
import { csvDataSource } from './csvDataSource'
import { docsCaptureGoalScenarios } from './docsCaptureGoalScenarios'

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
function enrichDocsCaptureDataset(dataset: ExpenseDataset): ExpenseDataset {
  const { plans, transactions: planTxns } = demoInstallments(dataset)
  const cards = dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active)

  const accountStatements: AccountStatement[] = []
  for (const card of cards) {
    accountStatements.push(
      { accountId: card.id, yearMonth: '2026-03', paid: true, paidOn: '2026-04-14' },
      // April budget settles mid-May — visible in May Transactions on paid date.
      { accountId: card.id, yearMonth: '2026-04', paid: true, paidOn: '2026-05-14' },
      // May budget settles mid-June — appears in June Transactions, not May.
      { accountId: card.id, yearMonth: '2026-05', paid: true, paidOn: '2026-06-14' },
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
  return {
    ...dataset,
    flags,
    attachments,
    // A claimant, so the claim's header renders as a real document rather
    // than an anonymous table.
    settings: { ...dataset.settings, claimantName: 'Alex Moreno' },
    accountStatements: cards.length > 0 ? accountStatements : dataset.accountStatements,
    installmentPlans: plans,
    transactions: deriveTransactions(stored, dataset.accounts, accountStatements),
  }
}

let nextId = 900_000
let nextFlagId = 970_100
let nextAttachmentId = 960_100

function stubTxn(input: NewTransaction): Transaction {
  nextId += 1
  const { planId, flagId, ...rest } = input
  return {
    ...rest,
    ...(planId != null ? { planId } : {}),
    ...(flagId != null ? { flagId } : {}),
    id: nextId,
    cancelled: false,
    status: 'posted',
  }
}

/**
 * The rows handed out by the last `load`.
 *
 * Every other mutation here can answer from its input alone, but a *patch*
 * cannot: returning a stub built from the patch replaces the real row with one
 * that has lost its flag, its amount and everything else the patch did not
 * mention. Recording a reimbursement against the capture source looked like it
 * had done nothing for exactly that reason.
 */
let loaded: Transaction[] = []

export const docsCaptureDataSource: ExpenseDataSource = {
  canWrite: true,
  load(): Promise<ExpenseDataset> {
    return csvDataSource.load().then((dataset) => {
      const enriched = enrichDocsCaptureDataset({
        ...dataset,
        goalScenarios: docsCaptureGoalScenarios(),
      })
      loaded = enriched.transactions
      return enriched
    })
  },
  createTransaction(input) {
    return Promise.resolve(stubTxn(input))
  },
  createTransactions(inputs) {
    return Promise.resolve(inputs.map((input) => stubTxn(input)))
  },
  // stubTxn always mints a fresh id, which is right for a create but wrong for a patch:
  // the caller replaces the row whose id matches what comes back (see
  // patchAfterTransactionUpdate), and a stub's new id matches nothing, so the edit
  // silently no-ops on screen. Merged onto the real row instead, same as the bulk path.
  updateTransaction(id, patch) {
    const existing = loaded.find((t) => t.id === id)
    const merged = existing
      ? ({ ...existing, ...patch } as Transaction)
      : stubTxn({ ...patch, id } as NewTransaction & { id: number })
    loaded = loaded.map((t) => (t.id === id ? merged : t))
    return Promise.resolve(merged)
  },
  // Was missing entirely, so anything routed through the bulk path — the
  // bulk-edit sheet, and recording a reimbursement — threw
  // "not a function" against the capture source.
  updateTransactions(ids, patch) {
    const byId = new Map(loaded.map((t) => [t.id, t]))
    const transactions = ids.map((id) => {
      const existing = byId.get(id)
      // Merged onto the real row, not rebuilt from the patch: the caller
      // replaces its copy with what comes back, so a rebuilt row would drop
      // every field the patch did not mention.
      return existing
        ? ({ ...existing, ...patch } as Transaction)
        : stubTxn({ ...patch, id } as NewTransaction & { id: number })
    })
    loaded = loaded.map((t) => transactions.find((u) => u.id === t.id) ?? t)
    return Promise.resolve({ updated: transactions.length, transactions })
  },
  deleteTransaction() {
    return Promise.resolve()
  },
  deleteTransactions(ids) {
    return Promise.resolve({ deleted: ids.length, requested: ids.length })
  },
  uploadAttachment(transactionId) {
    nextAttachmentId += 1
    return Promise.resolve({
      id: nextAttachmentId,
      transactionId,
      contentType: 'image/jpeg',
      byteSize: 180_000,
      createdAt: '2026-05-01T09:00:00Z',
      hasThumb: true,
    })
  },
  deleteAttachment() {
    return Promise.resolve()
  },
  createFlag(input) {
    nextFlagId += 1
    return Promise.resolve({ ...input, id: nextFlagId })
  },
  updateFlag(id, patch) {
    return Promise.resolve({
      id,
      name: patch.name ?? 'Flag',
      color: patch.color ?? '#6366f1',
      reimbursable: patch.reimbursable ?? true,
      sortOrder: patch.sortOrder ?? 0,
      active: patch.active ?? true,
      ...(patch.description ? { description: patch.description } : {}),
    })
  },
  deleteFlag() {
    return Promise.resolve({ unflagged: 0 })
  },
  setStatementPaid(accountId, yearMonth, paid, paidOn) {
    const row: AccountStatement = {
      accountId,
      yearMonth,
      paid,
      ...(paid && paidOn ? { paidOn } : {}),
    }
    return Promise.resolve(row)
  },
  setCashActual(yearMonth, actualCashCents) {
    if (actualCashCents === null) return Promise.resolve(null)
    const row: CashActual = { yearMonth, actualCashCents }
    return Promise.resolve(row)
  },
  createCategory(input: NewCategory) {
    nextId += 1
    const row: Category = { ...input, id: nextId, active: input.active ?? true }
    return Promise.resolve(row)
  },
  updateCategory(id, patch) {
    const row: Category = {
      id,
      name: patch.name ?? 'Category',
      monthlyBudgetCents: patch.monthlyBudgetCents ?? 0,
      sortOrder: patch.sortOrder ?? 0,
      active: patch.active ?? true,
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    }
    return Promise.resolve(row)
  },
  deleteCategory() {
    return Promise.resolve({ reassignedToId: null })
  },
  createAccount(input: NewAccount) {
    nextId += 1
    const row: Account = { ...input, id: nextId, active: input.active ?? true }
    return Promise.resolve(row)
  },
  updateAccount(id, patch) {
    const row: Account = {
      id,
      name: patch.name ?? 'Account',
      kind: patch.kind ?? 'debit',
      settlement: patch.settlement ?? 'immediate',
      active: patch.active ?? true,
    }
    return Promise.resolve(row)
  },
  deleteAccount() {
    return Promise.resolve({ reassignedToId: null })
  },
  updateSettings(patch: Partial<ExpenseSettings>) {
    return Promise.resolve(patch as ExpenseSettings)
  },
  createScenario(input: NewGoalScenario) {
    nextId += 1
    const scenario: GoalScenario = { ...input, id: nextId }
    return Promise.resolve(scenario)
  },
  updateScenario(id: number, patch: Partial<NewGoalScenario>) {
    const scenario: GoalScenario = {
      id,
      name: 'Scenario',
      color: '#6366f1',
      sortOrder: 0,
      startInvestedCents: 0,
      monthlyContributionCents: 0,
      annualContributionGrowth: 0,
      expectedRealReturn: 0.07,
      horizonYears: 30,
      housePriceCents: 0,
      downPaymentFraction: 0.2,
      housePurchaseYear: null,
      transactionCostsCents: 0,
      mortgageTermYears: 30,
      mortgageRateAnnual: 0.03,
      houseAppreciationRate: 0.025,
      rentMonthlyCents: 0,
      annualSpendCents: 0,
      safeWithdrawalRate: 0.04,
      planStartDate: null,
      lifeEvents: [],
      ...patch,
    }
    return Promise.resolve(scenario)
  },
  deleteScenario() {
    return Promise.resolve()
  },
  createInstallmentPlan(input: NewInstallmentPlan) {
    nextId += 1
    const { dueDayOfMonth, ...rest } = input
    const plan: InstallmentPlan = {
      ...rest,
      ...(dueDayOfMonth != null ? { dueDayOfMonth } : {}),
      id: nextId,
    }
    return Promise.resolve(plan)
  },
  updateInstallmentPlan(id: number, patch: Partial<NewInstallmentPlan>) {
    const plan: InstallmentPlan = {
      id,
      description: patch.description ?? 'Plan',
      totalCount: patch.totalCount ?? 12,
      amountCents: patch.amountCents ?? 0,
      accountId: patch.accountId ?? 0,
      categoryId: patch.categoryId ?? 0,
      type: patch.type ?? 'expense',
      anchorBudgetMonth: patch.anchorBudgetMonth ?? '2026-01',
      startInstallmentIndex: patch.startInstallmentIndex ?? 1,
      active: patch.active ?? true,
    }
    return Promise.resolve(plan)
  },
  deleteInstallmentPlan() {
    return Promise.resolve()
  },
  createWealthAccount(input: NewWealthAccount) {
    nextId += 1
    const account: WealthAccount = { ...input, id: nextId }
    return Promise.resolve(account)
  },
  updateWealthAccount(id: number, patch: Partial<NewWealthAccount>) {
    const account: WealthAccount = {
      id,
      name: patch.name ?? 'Account',
      kind: patch.kind ?? 'investment',
      sortOrder: patch.sortOrder ?? 0,
      archived: patch.archived ?? false,
    }
    return Promise.resolve(account)
  },
  deleteWealthAccount() {
    return Promise.resolve()
  },
  createWealthCheckin(input: NewWealthCheckin) {
    nextId += 1
    const checkin: WealthCheckin = {
      id: nextId,
      checkinDate: input.checkinDate,
      ...(input.note ? { note: input.note } : {}),
      createdAt: new Date().toISOString(),
      entries: input.entries.map((e) => ({ ...e })),
    }
    return Promise.resolve(checkin)
  },
  updateWealthCheckin(id: number, patch: Partial<NewWealthCheckin>) {
    const checkin: WealthCheckin = {
      id,
      checkinDate: patch.checkinDate ?? new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      entries: (patch.entries ?? []).map((e) => ({ ...e })),
    }
    return Promise.resolve(checkin)
  },
  deleteWealthCheckin() {
    return Promise.resolve()
  },
}
