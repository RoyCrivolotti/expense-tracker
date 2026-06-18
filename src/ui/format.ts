import type { Account, Category, ExpenseDataset, TxnStatus } from '../types'

export interface Lookup {
  category: (id: number) => Category | undefined
  account: (id: number) => Account | undefined
  categoryName: (id: number) => string
  accountName: (id: number) => string
}

export function buildLookup(dataset: ExpenseDataset): Lookup {
  const cats = new Map(dataset.categories.map((c) => [c.id, c]))
  const accs = new Map(dataset.accounts.map((a) => [a.id, a]))
  return {
    category: (id) => cats.get(id),
    account: (id) => accs.get(id),
    categoryName: (id) => cats.get(id)?.name ?? 'Uncategorised',
    accountName: (id) => accs.get(id)?.name ?? 'Unknown',
  }
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return DAY_FMT.format(new Date(Date.UTC(y, m - 1, d)))
}

export const STATUS_LABEL: Record<TxnStatus, string> = {
  posted: 'Posted',
  forecast: 'Forecast',
  cancelled: 'Cancelled',
}
