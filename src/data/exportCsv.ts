import type { ExpenseDataset } from '../types'
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
