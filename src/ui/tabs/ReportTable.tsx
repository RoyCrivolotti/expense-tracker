import type { ReportLine, ExpenseReport } from '../../domain/engine/expenseReport'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { formatDayLabel, type Lookup } from '../format'
import styles from './ExpenseReportView.module.css'

function ReportRow({
  line,
  lookup,
  format,
  showNotes,
  signed = false,
}: {
  line: ReportLine
  lookup: Lookup
  format: MoneyFormat
  showNotes: boolean
  signed?: boolean
}) {
  const { transaction } = line
  return (
    <tr>
      <td>{formatDayLabel(transaction.date)}</td>
      <td>
        {transaction.description || lookup.categoryName(transaction.categoryId)}
        {/* The transaction's own notes. An approver asks what a dinner was for,
            and that is exactly what this field already holds. */}
        {showNotes && transaction.notes ? <span className={styles.notes}>{transaction.notes}</span> : null}
      </td>
      <td className={styles.hideNarrow}>{lookup.categoryName(transaction.categoryId)}</td>
      <td className={styles.numeric}>
        {formatCents(signed ? -transaction.amountCents : transaction.amountCents, format)}
      </td>
      <td className={styles.numeric}>
        {line.receiptRefs.length > 0 ? line.receiptRefs.map((r) => `R${r}`).join(' ') : signed ? '—' : 'No receipt'}
      </td>
    </tr>
  )
}

export function ReportTable({
  report,
  lookup,
  format,
  showNotes,
}: {
  report: ExpenseReport
  lookup: Lookup
  format: MoneyFormat
  showNotes: boolean
}) {
  const settled = report.credits.length > 0
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <ReportTableHead />
        <tbody>
          {report.lines.map((line) => (
            <ReportRow key={line.transaction.id} line={line} lookup={lookup} format={format} showNotes={showNotes} />
          ))}
        </tbody>
        {settled ? (
          <tbody className={styles.creditsBody}>
            <tr>
              <th scope="row" colSpan={5} className={styles.sectionRow}>
                Already reimbursed
              </th>
            </tr>
            {report.credits.map((line) => (
              <ReportRow
                key={line.transaction.id}
                line={line}
                lookup={lookup}
                format={format}
                showNotes={showNotes}
                signed
              />
            ))}
          </tbody>
        ) : null}
        <tfoot>
          <TotalRow label="Total expenses" cents={report.totalClaimedCents} format={format} emphasis={!settled} />
          {settled ? (
            <>
              <TotalRow label="Less reimbursed" cents={-report.creditedCents} format={format} />
              <TotalRow label="Outstanding" cents={report.outstandingCents} format={format} emphasis />
            </>
          ) : null}
        </tfoot>
      </table>
    </div>
  )
}

/**
 * A totals row.
 *
 * The label spans only Date and Description, with a separate placeholder for
 * Category — a single `colSpan={3}` would keep claiming three columns after the
 * Category column is hidden on a narrow screen, pushing the figure one cell
 * right and out from under its own heading.
 */
function TotalRow({
  label,
  cents,
  format,
  emphasis,
}: {
  label: string
  cents: number
  format: MoneyFormat
  emphasis?: boolean
}) {
  return (
    <tr>
      <th scope="row" colSpan={2}>
        {label}
      </th>
      <td className={styles.hideNarrow} />
      <td className={`${styles.numeric} ${emphasis ? styles.total : ''}`}>{formatCents(cents, format)}</td>
      <td />
    </tr>
  )
}

function ReportTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Date</th>
        <th scope="col">Description</th>
        <th scope="col" className={styles.hideNarrow}>
          Category
        </th>
        <th scope="col" className={styles.numeric}>
          Amount
        </th>
        <th scope="col" className={styles.numeric}>
          Receipt
        </th>
      </tr>
    </thead>
  )
}
