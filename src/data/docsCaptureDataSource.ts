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
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
  StoredTransaction,
  Transaction,
} from '../types'
import type {
  ExpenseDataSource,
  NewAccount,
  NewCategory,
  NewGoalScenario,
  NewInstallmentPlan,
  NewTransaction,
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
  const transactions: StoredTransaction[] = [1, 2, 3].map((i) => ({
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
  const stored = [...dataset.transactions, ...planTxns]
  return {
    ...dataset,
    accountStatements: cards.length > 0 ? accountStatements : dataset.accountStatements,
    installmentPlans: plans,
    transactions: deriveTransactions(stored, dataset.accounts, accountStatements),
  }
}

let nextId = 900_000

function stubTxn(input: NewTransaction): Transaction {
  nextId += 1
  const { planId, ...rest } = input
  return {
    ...rest,
    ...(planId != null ? { planId } : {}),
    id: nextId,
    cancelled: false,
    status: 'posted',
  }
}

export const docsCaptureDataSource: ExpenseDataSource = {
  canWrite: true,
  load(): Promise<ExpenseDataset> {
    return csvDataSource.load().then((dataset) =>
      enrichDocsCaptureDataset({
        ...dataset,
        goalScenarios: docsCaptureGoalScenarios(),
      }),
    )
  },
  createTransaction(input) {
    return Promise.resolve(stubTxn(input))
  },
  createTransactions(inputs) {
    return Promise.resolve(inputs.map((input) => stubTxn(input)))
  },
  updateTransaction(id, patch) {
    return Promise.resolve(stubTxn({ ...patch, id } as NewTransaction & { id: number }))
  },
  deleteTransaction() {
    return Promise.resolve()
  },
  deleteTransactions(ids) {
    return Promise.resolve({ deleted: ids.length, requested: ids.length })
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
  updateSettings(patch: Partial<ExpenseSettings>) {
    return Promise.resolve(patch as ExpenseSettings)
  },
  updateGoals(patch: Partial<GoalInputs>) {
    return Promise.resolve(patch as GoalInputs)
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
      ...patch,
    }
    return Promise.resolve(scenario)
  },
  deleteScenario() {
    return Promise.resolve()
  },
  createInstallmentPlan(input: NewInstallmentPlan) {
    nextId += 1
    const plan: InstallmentPlan = { ...input, id: nextId }
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
}
