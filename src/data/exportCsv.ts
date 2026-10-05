import type { ExpenseDataset } from '../types'
import type { CategoryActuals } from '../engine'
import { EXPORT_CSV_HEADER } from '../domain/data/exportCsvFormat'
import { guardCsvValue } from '../domain/data/csvFormulaGuard'

function esc(value: string): string {
  // \r as well as \n: a bare carriage return mid-value is a record terminator in
  // Excel, which would split the row and start the next one with the remainder.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Text columns only — never the id, amount or flags, which must stay numeric. */
function escText(value: string): string {
  return esc(guardCsvValue(value))
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
  const header = EXPORT_CSV_HEADER
  const rows = txns.map((t) =>
    [
      t.id,
      t.date,
      t.budgetMonth,
      escText(t.description),
      escText(catNames.get(t.categoryId) ?? ''),
      escText(accNames.get(t.accountId) ?? ''),
      t.type,
      t.amountCents,
      t.status,
      t.cancelled ? 1 : 0,
      escText(t.notes ?? ''),
    ].join(','),
  )
  return [header, ...rows].join('\n')
}

/**
 * The monthly summary grid as CSV: categories down, budget and months across,
 * plus the year-scoped YTD the grid shows. Amounts in integer cents, like the
 * transaction export — exact, and immune to locale decimal marks.
 */
export function monthlySummaryCsv(rows: CategoryActuals[], months: string[], ytdYear: string): string {
  const header = ['category', 'monthly_budget_cents', ...months, `ytd_${ytdYear}_cents`].join(',')
  const lines = rows.map((r) =>
    [
      escText(r.name),
      r.monthlyBudgetCents,
      ...months.map((m) => r.byMonth.get(m) ?? 0),
      r.ytdActualCents,
    ].join(','),
  )
  return [header, ...lines].join('\n')
}

/** Trigger a browser download of a CSV. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Trigger a browser download of transaction CSV. */
export function downloadTransactionsCsv(
  dataset: ExpenseDataset,
  opts: { month?: string; filename?: string } = {},
): void {
  const monthPart = opts.month ? `-${opts.month}` : ''
  downloadCsv(opts.filename ?? `expenses${monthPart}.csv`, exportTransactionsCsv(dataset, opts))
}
