import type { ExpenseDataset } from '../types'
import { buildReimbursementPack } from '../domain/engine/reimbursementPack'
import { formatCents, type MoneyFormat } from '../engine/money'

/**
 * A claim as a spreadsheet, for an employer who wants one.
 *
 * Deliberately *not* an option on `exportTransactionsCsv`: that emits a fixed,
 * workbook-compatible `EXPORT_CSV_HEADER` which `parseExportCsv` round-trips, so
 * adding a column there would change an import contract for the sake of a
 * feature nobody asked to import. This is a different document with a different
 * audience — human-readable amounts, a receipts column, a total row.
 */
const HEADER = ['Date', 'Description', 'Category', 'Account', 'Amount', 'Receipts'] as const

function esc(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export interface ReimbursementCsvOptions {
  format: MoneyFormat
  categoryName: (id: number) => string
  accountName: (id: number) => string
}

export function reimbursementCsv(
  dataset: ExpenseDataset,
  flagId: number,
  options: ReimbursementCsvOptions,
): string | null {
  const pack = buildReimbursementPack(
    flagId,
    dataset.transactions,
    dataset.flags,
    dataset.attachments,
  )
  if (!pack) return null

  const rows = pack.lines.map((line) =>
    [
      line.transaction.date,
      line.transaction.description || options.categoryName(line.transaction.categoryId),
      options.categoryName(line.transaction.categoryId),
      options.accountName(line.transaction.accountId),
      // A refund reduces the claim, so it is written negative rather than as a
      // bare figure that would read as another expense.
      formatCents(
        line.transaction.type === 'refund' ? -line.transaction.amountCents : line.transaction.amountCents,
        options.format,
      ),
      String(line.receipts.length),
    ]
      .map(esc)
      .join(','),
  )

  const total = ['', 'Total', '', '', formatCents(pack.totalCents, options.format), ''].map(esc).join(',')
  return [HEADER.join(','), ...rows, total].join('\n')
}

export function downloadReimbursementCsv(
  dataset: ExpenseDataset,
  flagId: number,
  options: ReimbursementCsvOptions,
): void {
  const csv = reimbursementCsv(dataset, flagId, options)
  if (!csv) return
  const flag = dataset.flags.find((f) => f.id === flagId)
  const slug = (flag?.name ?? 'claim').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug || 'claim'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
