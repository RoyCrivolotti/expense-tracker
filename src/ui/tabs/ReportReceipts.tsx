import { reportReceipts, type ExpenseReport, type ReceiptFigure } from '../../domain/engine/expenseReport'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { formatDayLabel, type Lookup } from '../format'
import styles from './ExpenseReportView.module.css'

/** The receipt images (or the note for a PDF) printed after the table. */
export function ReportReceipts({
  report,
  lookup,
  format,
}: {
  report: ExpenseReport
  lookup: Lookup
  format: MoneyFormat
}) {
  const receipts = reportReceipts(report)
  if (receipts.length === 0) return null

  return (
    <section className={styles.receipts}>
      <h2 className={styles.receiptsTitle}>Receipts</h2>
      {receipts.map((receipt) => (
        <ReceiptFigureView key={receipt.attachment.id} receipt={receipt} lookup={lookup} format={format} />
      ))}
    </section>
  )
}

function ReceiptFigureView({
  receipt: { attachment, transaction, ref },
  lookup,
  format,
}: {
  receipt: ReceiptFigure
  lookup: Lookup
  format: MoneyFormat
}) {
  return (
    <figure className={styles.figure}>
      {attachment.contentType === 'application/pdf' ? (
        <div className={styles.pdfNote}>
          <p className={styles.pdfNoteText}>
            <strong>R{ref}</strong> is a PDF, sent as a separate attachment
            {attachment.originalName ? (
              <>
                {' '}
                (<strong>{attachment.originalName}</strong>)
              </>
            ) : null}
            .{' '}
            {/* Addressed to the claimant, so it stays off paper: the reader
                        of the printed page only needs to know a file travels with it.
                        Rendering a PDF here would mean shipping a PDF engine: pdf.js
                        is ~505 KB gzip against a 162 KB app, and it is the only
                        honest option — turning a PDF into pixels *is* the heavy
                        part. A screenshot costs nothing and already works, because
                        receipts accept image/png. */}
            <span className={styles.screenOnly}>
              To have it print on this page instead, attach a screenshot of it as an image.
            </span>
          </p>
          {/* Screen only: on paper a link is a dead underline, and the
                      filename in the sentence is what the reader actually needs. */}
          <a
            className={styles.pdfLink}
            href={`/api/expenses/attachments/${attachment.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open R{ref}
          </a>
        </div>
      ) : (
        <img
          src={`/api/expenses/attachments/${attachment.id}`}
          alt={`Receipt for ${transaction.description}`}
          className={styles.receiptImage}
        />
      )}
      <figcaption className={styles.caption}>
        <span className={styles.refBadge}>R{ref}</span> {formatDayLabel(transaction.date)} ·{' '}
        {transaction.description || lookup.categoryName(transaction.categoryId)} ·{' '}
        {formatCents(transaction.amountCents, format)}
      </figcaption>
    </figure>
  )
}
