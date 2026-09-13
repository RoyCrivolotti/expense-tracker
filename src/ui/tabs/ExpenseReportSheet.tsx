import type { Transaction } from '../../types'
import {
  reportReference,
  reportReceipts,
  type ReportLine,
  type ExpenseReport,
} from '../../domain/engine/expenseReport'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { formatDayLabel, type Lookup } from '../format'
import styles from './ExpenseReportView.module.css'

interface SheetProps {
  report: ExpenseReport
  lookup: Lookup
  format: MoneyFormat
  claimantName: string
  currencyCode: string
  /** Today, as the issue date. Injected so the printed date is testable. */
  issuedOn: string
  /** Opens a line's editor, so a missing receipt can be attached from here. */
  onOpenTransaction?: ((txn: Transaction) => void) | undefined
}

/** The document itself: everything that appears on paper, and nothing else. */
export function ExpenseReportSheet({
  report,
  lookup,
  format,
  claimantName,
  currencyCode,
  issuedOn,
  onOpenTransaction,
}: SheetProps) {
  const receipts = reportReceipts(report)

  return (
    <article className={styles.sheet}>
      <ReportHeader
        report={report}
        claimantName={claimantName}
        currencyCode={currencyCode}
        issuedOn={issuedOn}
      />
      <ReportTable report={report} lookup={lookup} format={format} />
      <MissingReceipts report={report} lookup={lookup} onOpenTransaction={onOpenTransaction} />

      {receipts.length > 0 ? (
        <section className={styles.receipts}>
          <h2 className={styles.receiptsTitle}>Receipts</h2>
          {receipts.map(({ attachment, transaction, ref }) => (
            <figure key={attachment.id} className={styles.figure}>
              {attachment.contentType === 'application/pdf' ? (
                <p className={styles.pdfNote}>
                  PDF receipt — attach <strong>{attachment.originalName ?? 'the file'}</strong>{' '}
                  separately; a PDF cannot be printed into this page.
                </p>
              ) : (
                <img
                  src={`/api/expenses/attachments/${attachment.id}`}
                  alt={`Receipt for ${transaction.description}`}
                  className={styles.receiptImage}
                />
              )}
              <figcaption className={styles.caption}>
                <span className={styles.refBadge}>R{ref}</span>{' '}
                {formatDayLabel(transaction.date)} ·{' '}
                {transaction.description || lookup.categoryName(transaction.categoryId)} ·{' '}
                {formatCents(transaction.amountCents, format)}
              </figcaption>
            </figure>
          ))}
        </section>
      ) : null}

      {/* Print-only: a claim usually has to be signed before it is submitted. */}
      <section className={styles.signature}>
        <div className={styles.signatureLine} />
        <p className={styles.signatureLabel}>
          Signature{claimantName ? ` — ${claimantName}` : ''}
        </p>
      </section>
    </article>
  )
}

function ReportHeader({
  report,
  claimantName,
  currencyCode,
  issuedOn,
}: {
  report: ExpenseReport
  claimantName: string
  currencyCode: string
  issuedOn: string
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <p className={styles.docType}>Expense report</p>
        <h1 className={styles.title}>{report.flag.name}</h1>
        {report.flag.description ? <p className={styles.subtitle}>{report.flag.description}</p> : null}
      </div>
      <dl className={styles.meta}>
        {claimantName ? (
          <div className={styles.metaRow}>
            <dt>Submitted by</dt>
            <dd>{claimantName}</dd>
          </div>
        ) : null}
        <div className={styles.metaRow}>
          <dt>Reference</dt>
          <dd>{reportReference(report)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Period</dt>
          <dd>
            {formatDayLabel(report.from)} – {formatDayLabel(report.to)}
          </dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Issued</dt>
          <dd>{formatDayLabel(issuedOn)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Items</dt>
          <dd>
            {report.lines.length} · {currencyCode}
          </dd>
        </div>
      </dl>
    </header>
  )
}

function ReportRow({
  line,
  lookup,
  format,
  signed = false,
}: {
  line: ReportLine
  lookup: Lookup
  format: MoneyFormat
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
        {transaction.notes ? <span className={styles.purpose}>{transaction.notes}</span> : null}
      </td>
      <td className={styles.hideNarrow}>{lookup.categoryName(transaction.categoryId)}</td>
      <td className={styles.numeric}>
        {formatCents(signed ? -transaction.amountCents : transaction.amountCents, format)}
      </td>
      <td className={styles.numeric}>
        {line.receiptRefs.length > 0 ? line.receiptRefs.map((r) => `R${r}`).join(' ') : '—'}
      </td>
    </tr>
  )
}

function ReportTable({
  report,
  lookup,
  format,
}: {
  report: ExpenseReport
  lookup: Lookup
  format: MoneyFormat
}) {
  const settled = report.credits.length > 0
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
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
        <tbody>
          {report.lines.map((line) => (
            <ReportRow key={line.transaction.id} line={line} lookup={lookup} format={format} />
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
                signed
              />
            ))}
          </tbody>
        ) : null}
        <tfoot>
          <TotalRow
            label="Total claimed"
            cents={report.totalClaimedCents}
            format={format}
            emphasis={!settled}
          />
          {settled ? (
            <>
              <TotalRow label="Less reimbursed" cents={-report.creditedCents} format={format} />
              <TotalRow
                label="Outstanding"
                cents={report.outstandingCents}
                format={format}
                emphasis
              />
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
      <td className={`${styles.numeric} ${emphasis ? styles.total : ''}`}>
        {formatCents(cents, format)}
      </td>
      <td />
    </tr>
  )
}

/**
 * The lines an approver will send back.
 *
 * Actionable rather than a bare count: each one opens its editor so the receipt
 * can be attached without leaving to hunt for the row. This is also the answer
 * for rows entered through bulk-add, which has no per-row receipt affordance.
 */
function MissingReceipts({
  report,
  lookup,
  onOpenTransaction,
}: {
  report: ExpenseReport
  lookup: Lookup
  onOpenTransaction?: ((txn: Transaction) => void) | undefined
}) {
  const bare = report.missingReceipts
  if (bare.length === 0) return null

  return (
    <div className={styles.warning}>
      <p className={styles.warningText}>
        {bare.length} item{bare.length === 1 ? ' has' : 's have'} no receipt attached. Most
        employers will send the claim back for those.
      </p>
      {onOpenTransaction ? (
        <ul className={styles.warningList}>
          {bare.map(({ transaction }) => (
            <li key={transaction.id}>
              <button
                type="button"
                className={styles.warningBtn}
                onClick={() => onOpenTransaction(transaction)}
              >
                {formatDayLabel(transaction.date)} ·{' '}
                {transaction.description || lookup.categoryName(transaction.categoryId)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
