import type { ExpenseDataset } from '../types'
import {
  buildExpenseReport,
  reportReference,
  type ReportLine,
} from '../domain/engine/expenseReport'
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
const HEADER = ['Date', 'Description', 'Purpose', 'Category', 'Account', 'Amount', 'Receipts'] as const

function esc(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export interface ExpenseReportCsvOptions {
  format: MoneyFormat
  categoryName: (id: number) => string
  accountName: (id: number) => string
}

export function expenseReportCsv(
  dataset: ExpenseDataset,
  flagId: number,
  options: ExpenseReportCsvOptions,
): string | null {
  const report = buildExpenseReport(
    flagId,
    dataset.transactions,
    dataset.flags,
    dataset.attachments,
  )
  if (!report) return null

  const row = (line: ReportLine, signed: boolean) =>
    [
      line.transaction.date,
      line.transaction.description || options.categoryName(line.transaction.categoryId),
      // The transaction's own notes: an approver asks what a dinner was *for*,
      // and that is exactly what the notes field already holds.
      line.transaction.notes ?? '',
      options.categoryName(line.transaction.categoryId),
      options.accountName(line.transaction.accountId),
      // A credit is written negative so the Amount column still sums to the
      // outstanding figure when someone totals it in a spreadsheet.
      formatCents(signed ? -line.transaction.amountCents : line.transaction.amountCents, options.format),
      // Cross-references rather than a count, matching the figures in the
      // printed sheet, so a row can actually be tied to an image.
      line.receiptRefs.map((ref) => `R${ref}`).join(' '),
    ]
      .map(esc)
      .join(',')

  // The spreadsheet copy of the claim carried neither claimant nor reference,
  // so a second submission was indistinguishable from the first.
  const preamble = [
    ['Claim', report.flag.name].map(esc).join(','),
    ['Reference', reportReference(report)].map(esc).join(','),
    ...(dataset.settings.claimantName
      ? [['Claimant', dataset.settings.claimantName].map(esc).join(',')]
      : []),
    '',
  ]
  const rows = report.lines.map((line) => row(line, false))
  const credits = report.credits.map((line) => row(line, true))
  const blank = (label: string, cents: number) =>
    ['', label, '', '', '', formatCents(cents, options.format), ''].map(esc).join(',')

  const totals = [blank('Total claimed', report.totalClaimedCents)]
  if (report.credits.length > 0) {
    totals.push(blank('Less reimbursed', -report.creditedCents))
    totals.push(blank('Outstanding', report.outstandingCents))
  }
  return [...preamble, HEADER.join(','), ...rows, ...credits, ...totals].join('\n')
}

export function downloadExpenseReportCsv(
  dataset: ExpenseDataset,
  flagId: number,
  options: ExpenseReportCsvOptions,
): void {
  const csv = expenseReportCsv(dataset, flagId, options)
  if (!csv) return
  const report = buildExpenseReport(flagId, dataset.transactions, dataset.flags, dataset.attachments)
  const flag = dataset.flags.find((f) => f.id === flagId)
  // Period in the filename: without it a second claim on the same flag lands in
  // Downloads as work-travel(1).csv, or overwrites the first.
  const period = report?.from ? `-${report.from.slice(0, 7)}` : ''
  const slug = (flag?.name ?? 'claim').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug || 'claim'}${period}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
