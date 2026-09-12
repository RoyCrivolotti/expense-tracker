import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ExpenseDataset } from '../../types'
import { buildReimbursementPack, packReceipts } from '../../domain/engine/reimbursementPack'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { downloadReimbursementCsv } from '../../data/reimbursementCsv'
import { formatCents } from '../../engine/money'
import { formatDayLabel, type Lookup } from '../format'
import styles from './ReimbursementPackView.module.css'

interface Props {
  dataset: ExpenseDataset
  lookup: Lookup
  flagId: number
  onClose: () => void
}

/**
 * A claim, laid out to be printed.
 *
 * The deliverable is a PDF the user hands to an employer, and the browser's own
 * print-to-PDF is the whole mechanism — no dependency, no server round trip. So
 * the page is the document: `@media print` drops the app chrome and the two
 * buttons, and the on-screen view is just the same document with a toolbar.
 */
export function ReimbursementPackView({ dataset, lookup, flagId, onClose }: Props) {
  const format = useMoneyFormat()

  /*
   * The overlay is portalled out of #root and flags the body while it is open,
   * so a global print rule can hide the app behind it. Printing the app tree as
   * well would put the nav, the FAB and the month's transactions into the PDF
   * the user is about to hand to somebody.
   */
  useEffect(() => {
    document.body.dataset.packOpen = 'true'
    return () => {
      delete document.body.dataset.packOpen
    }
  }, [])

  const pack = buildReimbursementPack(flagId, dataset.transactions, dataset.flags, dataset.attachments)
  if (!pack) return null
  const receipts = packReceipts(pack)

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Back
        </button>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() =>
              downloadReimbursementCsv(dataset, flagId, {
                format,
                categoryName: lookup.categoryName,
                accountName: lookup.accountName,
              })
            }
          >
            Download CSV
          </button>
          <button type="button" className={styles.printBtn} onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
      </div>

      <article className={styles.sheet}>
        <header className={styles.header}>
          <h1 className={styles.title}>{pack.flag.name}</h1>
          {pack.flag.description ? (
            <p className={styles.subtitle}>{pack.flag.description}</p>
          ) : null}
          <p className={styles.range}>
            {formatDayLabel(pack.from)} – {formatDayLabel(pack.to)} · {pack.lines.length} item
            {pack.lines.length === 1 ? '' : 's'}
          </p>
        </header>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Description</th>
              <th scope="col">Category</th>
              <th scope="col" className={styles.numeric}>
                Amount
              </th>
              <th scope="col" className={styles.numeric}>
                Receipt
              </th>
            </tr>
          </thead>
          <tbody>
            {pack.lines.map(({ transaction, receipts: lineReceipts }) => (
              <tr key={transaction.id}>
                <td>{formatDayLabel(transaction.date)}</td>
                <td>{transaction.description || lookup.categoryName(transaction.categoryId)}</td>
                <td>{lookup.categoryName(transaction.categoryId)}</td>
                <td className={styles.numeric}>
                  {formatCents(
                    transaction.type === 'refund' ? -transaction.amountCents : transaction.amountCents,
                    format,
                  )}
                </td>
                <td className={styles.numeric}>
                  {lineReceipts.length > 0 ? lineReceipts.length : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total claimed
              </th>
              <td className={`${styles.numeric} ${styles.total}`}>
                {formatCents(pack.totalCents, format)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        {pack.missingReceipts > 0 ? (
          <p className={styles.warning}>
            {pack.missingReceipts} item{pack.missingReceipts === 1 ? ' has' : 's have'} no receipt
            attached. Most employers will send the claim back for those.
          </p>
        ) : null}

        {receipts.length > 0 ? (
          <section className={styles.receipts}>
            <h2 className={styles.receiptsTitle}>Receipts</h2>
            {receipts.map(({ attachment, transaction }) => (
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
                  {formatDayLabel(transaction.date)} ·{' '}
                  {transaction.description || lookup.categoryName(transaction.categoryId)} ·{' '}
                  {formatCents(transaction.amountCents, format)}
                </figcaption>
              </figure>
            ))}
          </section>
        ) : null}
      </article>
    </div>,
    document.body,
  )
}
