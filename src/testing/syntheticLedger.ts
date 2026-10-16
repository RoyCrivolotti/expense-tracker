/**
 * A deterministic, public-safe `ExpenseDataset` of any size, for tests and for measuring what the data
 * layer costs as a ledger grows. Same shape and ordering the API returns (date DESC, id DESC, status
 * derived), so the engines and the server code see what they see in production.
 */
import type { ExpenseDataset, StoredTransaction, Transaction, TransactionAttachment } from '../domain/types'
import { deriveTransactions } from '../domain/engine/status'
import { shiftBudgetMonth } from '../domain/engine/dates'
import { mulberry32 } from '../domain/engine/rng'
import {
  CAT,
  CHECKING,
  syntheticAccounts,
  syntheticCashActuals,
  syntheticCategories,
  syntheticFlags,
  syntheticLabels,
  syntheticPlans,
  syntheticSettings,
  syntheticStatements,
  syntheticWealth,
} from './syntheticReference'
import { type RowDraft, monthDrafts, planDrafts } from './syntheticTransactions'

export interface LedgerShape {
  /** Budget months, ending at `endMonth`. */
  months: number
  /** Ordinary transactions per month, on top of the fixed series. */
  perMonth: number
  seed?: number
  endMonth?: string
}

interface Numbered {
  stored: StoredTransaction[]
  labelIds: Map<number, number[]>
}

function number(drafts: RowDraft[]): Numbered {
  const stored: StoredTransaction[] = []
  const labelIds = new Map<number, number[]>()
  const groups = new Map<string, number[]>()
  drafts.forEach((draft, i) => {
    const { labelIds: labels, claimGroup, ...rest } = draft
    const id = i + 1
    stored.push({ id, ...rest })
    if (labels.length > 0) labelIds.set(id, labels)
    if (claimGroup) groups.set(claimGroup, [...(groups.get(claimGroup) ?? []), id])
  })
  for (const [group, ids] of groups) settle(stored, group.slice('claim-'.length), ids)
  return { stored, labelIds }
}

/** One refund covers a claim's rows, which then point at it and drop their flag, as the app does. */
function settle(stored: StoredTransaction[], month: string, ids: number[]): void {
  const covered = ids.flatMap((id) => stored[id - 1] ?? [])
  const total = covered.reduce((sum, row) => sum + row.amountCents, 0)
  const refundId = stored.length + 1
  stored.push({
    id: refundId,
    date: `${month}-27`,
    budgetMonth: month,
    description: 'Employer reimbursement',
    accountId: CHECKING,
    categoryId: CAT.other,
    type: 'refund',
    amountCents: total,
    cancelled: false,
    createdAt: `${month}-27T09:00:00Z`,
    reportCount: ids.length,
    reportCoveredCents: total,
  })
  for (const row of covered) {
    delete row.flagId
    row.settledBy = refundId
  }
}

/** In the order the API returns them: by transaction, then id. */
function attachmentsFor(transactions: Transaction[]): TransactionAttachment[] {
  return transactions
    .filter((t) => t.id % 50 === 0)
    .sort((a, b) => a.id - b.id)
    .map((t, i) => ({
      id: i + 1,
      transactionId: t.id,
      contentType: 'image/jpeg',
      byteSize: 120_000,
      createdAt: `${t.date}T10:00:00Z`,
      hasThumb: true,
    }))
}

export function syntheticLedger(shape: LedgerShape): ExpenseDataset {
  const endMonth = shape.endMonth ?? '2026-09'
  const rnd = mulberry32(shape.seed ?? 1)
  const months = Array.from({ length: shape.months }, (_, i) =>
    shiftBudgetMonth(endMonth, i - (shape.months - 1)),
  )
  const accounts = syntheticAccounts()
  const plans = syntheticPlans(endMonth)
  const statements = syntheticStatements(months, endMonth)
  const drafts = months.flatMap((month, i) => [
    ...monthDrafts(month, i, shape.perMonth, rnd),
    ...planDrafts(month, plans),
  ])
  const { stored, labelIds } = number(drafts)
  const transactions = deriveTransactions(stored, accounts, statements)
    .map((t) => ({ ...t, labelIds: labelIds.get(t.id) ?? [] }))
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
  return {
    categories: syntheticCategories(),
    accounts,
    flags: syntheticFlags(),
    labels: syntheticLabels(),
    attachments: attachmentsFor(transactions),
    transactions,
    accountStatements: statements,
    cashActuals: syntheticCashActuals(months),
    installmentPlans: plans,
    goalScenarios: [],
    settings: syntheticSettings(),
    ...syntheticWealth(months),
  }
}
