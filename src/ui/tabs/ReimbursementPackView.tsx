import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ExpenseDataset, Transaction } from '../../types'
import { buildReimbursementPack } from '../../domain/engine/reimbursementPack'
import { ClaimSheet } from './ClaimSheet'
import { todayIso } from '../components/transactionFormState'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { downloadReimbursementCsv } from '../../data/reimbursementCsv'
import type { Lookup } from '../format'
import styles from './ReimbursementPackView.module.css'

interface Props {
  dataset: ExpenseDataset
  lookup: Lookup
  flagId: number
  onClose: () => void
  /** Opens a line's editor, so a missing receipt can be attached from here. */
  onOpenTransaction?: ((txn: Transaction) => void) | undefined
  /** Overridable so the printed issue date is testable. */
  issuedOn?: string
}

/**
 * A claim, laid out to be printed.
 *
 * The deliverable is a PDF the user hands to an employer, and the browser's own
 * print-to-PDF is the whole mechanism — no dependency, no server round trip. So
 * the page is the document: `@media print` drops the app chrome and the two
 * buttons, and the on-screen view is just the same document with a toolbar.
 */
export function ReimbursementPackView({
  dataset,
  lookup,
  flagId,
  onClose,
  onOpenTransaction,
  issuedOn,
}: Props) {
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

      <ClaimSheet
        pack={pack}
        lookup={lookup}
        format={format}
        claimantName={dataset.settings.claimantName}
        currencyCode={dataset.settings.currencyCode}
        issuedOn={issuedOn ?? todayIso()}
        onOpenTransaction={onOpenTransaction}
      />
    </div>,
    document.body,
  )
}
