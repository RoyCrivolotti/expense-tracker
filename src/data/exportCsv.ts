import type { ExpenseDataset } from '../types'

function esc(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Serialize transactions to CSV (workbook-compatible columns). */
export function exportTransactionsCsv(
  dataset: ExpenseDataset,
  opts: { month?: string } = {},
): string {
  const catNames = new Map(dataset.categories.map((c) => [c.id, c.name]))
  const accNames = new Map(dataset.accounts.map((a) => [a.id, a.name]))
  const txns = opts.month
    ? dataset.transactions.filter((t) => t.budgetMonth === opts.month)
    : dataset.transactions
  const header =
    'id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes'
  const rows = txns.map((t) =>
    [
      t.id,
      t.date,
      t.budgetMonth,
      esc(t.description),
      esc(catNames.get(t.categoryId) ?? ''),
      esc(accNames.get(t.accountId) ?? ''),
      t.type,
      t.amountCents,
      t.status,
      t.cancelled ? 1 : 0,
      esc(t.notes ?? ''),
    ].join(','),
  )
  return [header, ...rows].join('\n')
}

/** Trigger a browser download of transaction CSV. */
export function downloadTransactionsCsv(
  dataset: ExpenseDataset,
  opts: { month?: string; filename?: string } = {},
): void {
  const csv = exportTransactionsCsv(dataset, opts)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const monthPart = opts.month ? `-${opts.month}` : ''
  a.href = url
  a.download = opts.filename ?? `expenses${monthPart}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
