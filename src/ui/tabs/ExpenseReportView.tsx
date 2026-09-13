import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ExpenseDataset, Transaction } from '../../types'
import { buildExpenseReport } from '../../domain/engine/expenseReport'
import { ExpenseReportSheet } from './ExpenseReportSheet'
import { todayIso } from '../components/transactionFormState'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { downloadExpenseReportCsv } from '../../data/expenseReportCsv'
import type { Lookup } from '../format'
import styles from './ExpenseReportView.module.css'

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
export function ExpenseReportView({
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
  const report = buildExpenseReport(flagId, dataset.transactions, dataset.flags, dataset.attachments)

  /*
   * Guarded on `report`, and declared before the early return so the hook order
   * is stable. Setting the flag unconditionally meant an empty report rendered
   * nothing while leaving `<body data-report-open>` set for the rest of the
   * session — and theme.css hides #root under that attribute when printing, so
   * Cmd+P anywhere in the app produced a blank page until reload.
   */
  useEffect(() => {
    if (!report) return
    document.body.dataset.reportOpen = 'true'
    return () => {
      delete document.body.dataset.reportOpen
    }
  }, [report])

  if (!report) return null

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
              downloadExpenseReportCsv(dataset, flagId, {
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

      <ExpenseReportSheet
        report={report}
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
