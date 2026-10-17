/**
 * Small seeded ledgers that hit the corners the engines treat specially, for tests that compare an
 * engine's output over every row with its output over a ledger. The same seed gives the same ledger.
 * Placeholder data only. `src/testing/syntheticLedger.ts` is the large, regular counterpart.
 */
import type { Account, AccountStatement, ExpenseDataset, StoredTransaction, TxnType } from '../domain/types'
import { defaultBudgetMonth, shiftBudgetMonth } from '../domain/engine/dates'
import { deriveTransactions } from '../domain/engine/status'
import { mulberry32 } from '../domain/engine/rng'
import { makeDataset } from './factories'
import { planDrafts } from './syntheticTransactions'
import {
  CAT,
  CHECKING,
  TRAVEL_CARD,
  VISA,
  syntheticAccounts,
  syntheticCashActuals,
  syntheticCategories,
  syntheticFlags,
  syntheticLabels,
  syntheticPlans,
  syntheticSettings,
  syntheticWealth,
} from './syntheticReference'

type Rnd = () => number
const pick = <T>(items: readonly T[], rnd: Rnd): T => items[Math.floor(rnd() * items.length)] as T
const between = (lo: number, hi: number, rnd: Rnd): number => lo + Math.floor(rnd() * (hi - lo + 1))
const pad = (n: number): string => String(n).padStart(2, '0')

const SERIES = [
  ['Rent', CAT.rent, 90_000, 1],
  ['Gym membership', CAT.health, 3_900, 8],
  ['Music streaming', CAT.subscriptions, 1_099, 5],
] as const

interface Draft extends Omit<StoredTransaction, 'id' | 'budgetMonth'> {
  labelIds: number[]
}

function ordinary(date: string, rnd: Rnd): Draft {
  const roll = rnd()
  const type: TxnType = roll < 0.08 ? 'refund' : roll < 0.14 ? 'income' : roll < 0.2 ? 'investment' : 'expense'
  const cents = rnd() < 0.05 ? 0 : between(100, 40_000, rnd)
  return {
    date,
    description: `${pick(['Market', 'Cafe', 'Pharmacy', 'Online store', 'Cinema'], rnd)} ${between(1, 3, rnd)}`,
    accountId: pick([CHECKING, CHECKING, VISA, TRAVEL_CARD, 9], rnd),
    categoryId: pick([CAT.groceries, CAT.dining, CAT.shopping, CAT.health, CAT.other, CAT.investments], rnd),
    type,
    amountCents: type === 'investment' && rnd() < 0.3 ? -cents : cents,
    cancelled: rnd() < 0.06,
    labelIds: rnd() < 0.15 ? [between(1, 3, rnd)] : [],
    ...(rnd() < 0.04 ? { flagId: between(1, 2, rnd) } : {}),
  }
}

function monthDrafts(month: string, rnd: Rnd, cancelledOnly: boolean): Draft[] {
  const drafts: Draft[] = []
  const day = (n: number) => `${month}-${pad(Math.min(n, 28))}`
  for (const [description, categoryId, amountCents, d] of SERIES) {
    if (rnd() < 0.85) drafts.push({ date: day(d), description, accountId: CHECKING, categoryId, type: 'expense', amountCents, cancelled: false, labelIds: [] })
  }
  if (Number(month.slice(5)) % 3 === 1 && rnd() < 0.9) {
    drafts.push({ date: day(14), description: 'Water bill', accountId: CHECKING, categoryId: CAT.utilities, type: 'expense', amountCents: 6_400, cancelled: false, labelIds: [] })
  }
  for (let i = between(0, 6, rnd); i > 0; i--) drafts.push(ordinary(day(between(1, 31, rnd)), rnd))
  return cancelledOnly ? drafts.map((d) => ({ ...d, cancelled: true })) : drafts
}

function statementsFor(months: string[], rnd: Rnd): AccountStatement[] {
  return [VISA, TRAVEL_CARD].flatMap((accountId) =>
    months.flatMap((yearMonth) => {
      if (rnd() < 0.15) return []
      const paid = rnd() < 0.6
      return [{ accountId, yearMonth, paid, ...(paid ? { paidOn: `${yearMonth}-28` } : {}) }]
    }),
  )
}

/**
 * One payment that settles two earlier rows, as recording a reimbursement does. Some payments are
 * legacy (recorded before the covered count was kept, so nothing but the rows points at them) and some
 * are orphans (the rows were unsettled since, so only the covered count marks them).
 */
function settle(stored: StoredTransaction[], rnd: Rnd): void {
  const candidates = stored.filter((t) => t.type === 'expense' && !t.cancelled && t.planId == null)
  if (candidates.length < 3) return
  const covered = [pick(candidates, rnd), pick(candidates, rnd)].filter((t, i, all) => all.indexOf(t) === i)
  const total = covered.reduce((sum, t) => sum + t.amountCents, 0)
  const legacy = rnd() < 0.3
  const orphan = !legacy && rnd() < 0.25
  const month = stored.at(-1)?.budgetMonth ?? '2025-01'
  const payment: StoredTransaction = {
    id: stored.length + 1,
    date: `${month}-27`,
    budgetMonth: month,
    description: 'Reimbursement',
    accountId: CHECKING,
    categoryId: CAT.other,
    type: 'refund',
    amountCents: total,
    cancelled: false,
    ...(legacy ? {} : { reportCount: covered.length, reportCoveredCents: total }),
  }
  if (!orphan) {
    for (const row of covered) {
      delete row.flagId
      row.settledBy = payment.id
    }
  }
  stored.push(payment)
}

export function randomLedger(seed: number): ExpenseDataset {
  const rnd = mulberry32(seed + 1)
  const monthCount = pick([0, 1, 2, 3, 7, 14, 30], rnd)
  const rollover = pick([1, 1, 5, 25], rnd)
  const endMonth = '2026-06'
  const calendar = Array.from({ length: monthCount }, (_, i) => shiftBudgetMonth(endMonth, i - monthCount + 1))
  const withData = calendar.filter(() => rnd() > 0.2)
  const plans = rnd() < 0.7 ? syntheticPlans(endMonth) : []
  const stored: StoredTransaction[] = []
  const labelIds = new Map<number, number[]>()
  for (const month of withData) {
    const cancelledOnly = rnd() < 0.12
    const planned = planDrafts(month, plans).map(({ claimGroup: _group, ...d }) => d)
    for (const { labelIds: labels, ...row } of [...monthDrafts(month, rnd, cancelledOnly), ...planned]) {
      const id = stored.length + 1
      stored.push({ ...row, id, budgetMonth: row.planId == null ? defaultBudgetMonth(row.date, rollover) : month })
      if (labels.length > 0) labelIds.set(id, labels)
    }
  }
  settle(stored, rnd)
  const accounts: Account[] = syntheticAccounts().filter((a) => a.id !== TRAVEL_CARD || rnd() < 0.5)
  const statements = statementsFor(withData, rnd)
  const derived = deriveTransactions(stored, accounts, statements).map((t) => ({ ...t, labelIds: labelIds.get(t.id) ?? [] }))
  const transactions = derived.sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
  return makeDataset({
    categories: syntheticCategories(),
    accounts,
    flags: syntheticFlags(),
    labels: syntheticLabels(),
    transactions,
    accountStatements: statements,
    cashActuals: rnd() < 0.7 ? syntheticCashActuals(withData) : [],
    installmentPlans: plans,
    settings: { ...syntheticSettings(), budgetRolloverDay: rollover },
    ...syntheticWealth(withData),
  })
}
