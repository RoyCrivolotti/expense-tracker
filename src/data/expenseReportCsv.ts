import {
  reportReference,
  type ExpenseReport,
  type ReportLine,
} from '../domain/engine/expenseReport'
import { formatCents, type MoneyFormat } from '../engine/money'
import { guardCsvValue } from '../domain/data/csvFormulaGuard'

/**
 * An expense report as a spreadsheet, for an employer who wants one.
 *
 * Deliberately *not* an option on `exportTransactionsCsv`: that emits a fixed,
 * workbook-compatible `EXPORT_CSV_HEADER` which `parseExportCsv` round-trips, so
 * adding a column there would change an import contract for the sake of a
 * feature nobody asked to import. This is a different document with a different
 * audience — human-readable amounts, a receipts column, a total row.
 */
const HEADER = ['Date', 'Description', 'Purpose', 'Category', 'Account', 'Amount', 'Receipts'] as const

function esc(value: string): string {
  // \r is quoted as well as \n: a bare CR *inside* a value is a record terminator in
  // Excel, so `foo\r=1+1` would otherwise split into two rows and start the next one
  // with a formula — surviving guardCsvValue, which only inspects the first char.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Quote-escape a field that came from user or imported text. */
function escText(value: string): string {
  return esc(guardCsvValue(value))
}

export interface ExpenseReportCsvOptions {
  format: MoneyFormat
  categoryName: (id: number) => string
  accountName: (id: number) => string
}

/**
 * Takes an assembled report rather than a flag id: the same document can come
 * from an open flag or from a payment that settled it months ago, and the CSV
 * has no business knowing which.
 */
export function expenseReportCsv(
  report: ExpenseReport | null,
  options: ExpenseReportCsvOptions & { claimantName?: string },
): string | null {
  if (!report) return null

  const row = (line: ReportLine, signed: boolean) =>
    [
      esc(line.transaction.date),
      escText(line.transaction.description || options.categoryName(line.transaction.categoryId)),
      // The transaction's own notes: an approver asks what a dinner was *for*,
      // and that is exactly what the notes field already holds.
      escText(line.transaction.notes ?? ''),
      escText(options.categoryName(line.transaction.categoryId)),
      escText(options.accountName(line.transaction.accountId)),
      // A credit is written negative so the Amount column still sums to the
      // outstanding figure when someone totals it in a spreadsheet. Not guarded —
      // see guardCsvValue: that leading minus is load-bearing.
      esc(formatCents(signed ? -line.transaction.amountCents : line.transaction.amountCents, options.format)),
      // Cross-references rather than a count, matching the figures in the
      // printed sheet, so a row can actually be tied to an image.
      esc(line.receiptRefs.map((ref) => `R${ref}`).join(' ')),
    ].join(',')

  // The spreadsheet copy of the claim carried neither claimant nor reference,
  // so a second submission was indistinguishable from the first.
  const preamble = [
    ['Claim', escText(report.flag.name)].join(','),
    // reportReference maps the first character of each word in the description, so a
    // description beginning `=` produces a reference beginning `=` too.
    ['Reference', escText(reportReference(report))].join(','),
    ...(options.claimantName ? [['Submitted by', escText(options.claimantName)].join(',')] : []),
    '',
  ]
  const rows = report.lines.map((line) => row(line, false))
  const credits = report.credits.map((line) => row(line, true))
  // Labels are literals and the amount must keep its sign, so neither needs guarding.
  const blank = (label: string, cents: number) =>
    ['', label, '', '', '', formatCents(cents, options.format), ''].map(esc).join(',')

  const totals = [blank('Total expenses', report.totalClaimedCents)]
  if (report.credits.length > 0) {
    totals.push(blank('Less reimbursed', -report.creditedCents))
    totals.push(blank('Outstanding', report.outstandingCents))
  }
  return [...preamble, HEADER.join(','), ...rows, ...credits, ...totals].join('\n')
}

export function downloadExpenseReportCsv(
  report: ExpenseReport | null,
  options: ExpenseReportCsvOptions & { claimantName?: string },
): void {
  const csv = expenseReportCsv(report, options)
  if (!csv || !report) return
  // Period in the filename: without it a second report on the same flag lands in
  // Downloads as work-travel(1).csv, or overwrites the first.
  const period = report.from ? `-${report.from.slice(0, 7)}` : ''
  const slug = report.flag.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug || 'expense-report'}${period}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
