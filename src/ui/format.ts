import type {
  Account,
  Category,
  ExpenseDataset,
  Flag,
  InstallmentPlan,
  Transaction,
  TransactionAttachment,
  TxnStatus,
} from '../types'
import { buildReimbursementLinks } from '../domain/engine/reimbursementLinks'

export interface Lookup {
  category: (id: number) => Category | undefined
  account: (id: number) => Account | undefined
  flag: (id: number) => Flag | undefined
  attachments: (transactionId: number) => TransactionAttachment[]
  categoryName: (id: number) => string
  accountName: (id: number) => string
  installmentPlan: (id: number) => InstallmentPlan | undefined
  /** The reimbursement that settled this transaction, if one has. */
  settlementFor: (transactionId: number) => Transaction | undefined
  /** The transactions this reimbursement settled, oldest first. */
  settledBy: (reimbursementId: number) => Transaction[]
}

export function buildLookup(dataset: ExpenseDataset): Lookup {
  const cats = new Map(dataset.categories.map((c) => [c.id, c]))
  const accs = new Map(dataset.accounts.map((a) => [a.id, a]))
  const plans = new Map(dataset.installmentPlans.map((p) => [p.id, p]))
  const flags = new Map(dataset.flags.map((f) => [f.id, f]))
  // Grouped once per dataset rather than filtered per row: the transactions
  // list re-renders often and this would otherwise be quadratic.
  const attachmentsByTxn = new Map<number, TransactionAttachment[]>()
  for (const attachment of dataset.attachments) {
    const bucket = attachmentsByTxn.get(attachment.transactionId)
    if (bucket) bucket.push(attachment)
    else attachmentsByTxn.set(attachment.transactionId, [attachment])
  }
  const links = buildReimbursementLinks(dataset.transactions)

  return {
    category: (id) => cats.get(id),
    account: (id) => accs.get(id),
    flag: (id) => flags.get(id),
    attachments: (transactionId) => attachmentsByTxn.get(transactionId) ?? [],
    categoryName: (id) => cats.get(id)?.name ?? 'Uncategorised',
    accountName: (id) => accs.get(id)?.name ?? 'Unknown',
    installmentPlan: (id) => plans.get(id),
    settlementFor: links.settlementFor,
    settledBy: links.settledBy,
  }
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const SHORT_DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})

export function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return DAY_FMT.format(new Date(Date.UTC(y, m - 1, d)))
}

/** Compact date for dense rows (e.g. "22 Jun"). */
export function shortDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return SHORT_DAY_FMT.format(new Date(Date.UTC(y, m - 1, d)))
}

export const STATUS_LABEL: Record<TxnStatus, string> = {
  posted: 'Posted',
  forecast: 'Forecast',
  cancelled: 'Cancelled',
}
