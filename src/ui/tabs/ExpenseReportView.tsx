import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExpenseDataset, Transaction } from '../../types'
import {
  buildExpenseReport,
  buildSettledReport,
  reportReceipts,
  type ExpenseReport,
} from '../../domain/engine/expenseReport'
import { pastReportDrifted } from '../../domain/engine/pastReports'
import { ExpenseReportSheet } from './ExpenseReportSheet'
import { todayIso } from '../components/transactionFormState'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { downloadExpenseReportCsv } from '../../data/expenseReportCsv'
import { deliverReceipts } from '../../data/receiptDownload'
import { namedReceipts, receiptPackName } from '../../domain/engine/receiptFiles'
import type { Lookup } from '../format'
import styles from './ExpenseReportView.module.css'

interface Props {
  dataset: ExpenseDataset
  lookup: Lookup
  /** The open report for this flag: what is still owed on it. */
  flagId?: number
  /**
   * A past report, as it was when this payment settled it. Rebuilt from the
   * rows the payment covered rather than from anything stored.
   */
  settledByPaymentId?: number
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
/**
 * Send the claim's receipts on their own, without the report around them.
 *
 * Its own component so the view keeps its branch count, and so the busy and
 * error states sit next to the button they belong to. Disabled rather than
 * hidden when a report has no receipts: the button going missing between two
 * reports reads as a bug, where a disabled one with a reason does not.
 */
function ReceiptsButton({ report, lookup }: { report: ExpenseReport; lookup: Lookup }) {
  const format = useMoneyFormat()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const figures = reportReceipts(report)
  const send = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      await deliverReceipts(
        namedReceipts(figures, format, (f) =>
          f.transaction.description || lookup.categoryName(f.transaction.categoryId),
        ),
        receiptPackName(report.flag.name, report.from),
      )
    } catch (e) {
      // AbortError is the user dismissing the share sheet, which is not a
      // failure and must not be reported as one.
      if (!(e instanceof Error) || e.name !== 'AbortError') {
        setErr(e instanceof Error ? e.message : 'Could not send the receipts')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.secondaryBtn}
        disabled={busy || figures.length === 0}
        aria-label={
          figures.length === 0 ? 'No receipts attached to this report' : 'Send receipts'
        }
        title={figures.length === 0 ? 'No receipts attached to this report' : undefined}
        onClick={() => void send()}
      >
        {/* No long/short split: "Receipts" fits beside CSV and Print even at
            390px, and "Rec." reads as nothing in particular. */}
        {busy ? 'Preparing…' : 'Receipts'}
      </button>
      {err ? (
        <p className={styles.toolbarError} role="alert">
          {err}
        </p>
      ) : null}
    </>
  )
}

export function ExpenseReportView({
  dataset,
  lookup,
  flagId,
  settledByPaymentId,
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
  const report =
    settledByPaymentId != null
      ? buildSettledReport(
          settledByPaymentId,
          dataset.transactions,
          dataset.flags,
          dataset.attachments,
        )
      : flagId != null
        ? buildExpenseReport(flagId, dataset.transactions, dataset.flags, dataset.attachments)
        : null

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

  // Only a reopened report can have drifted: an open claim has nothing submitted
  // to differ from yet.
  const drifted =
    settledByPaymentId != null && pastReportDrifted(settledByPaymentId, dataset.transactions)

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
              downloadExpenseReportCsv(report, {
                format,
                categoryName: lookup.categoryName,
                accountName: lookup.accountName,
                claimantName: dataset.settings.claimantName,
              })
            }
            aria-label="Download CSV"
          >
            {/* Two labels rather than one that wraps: at 390px "Print or save as
                PDF" breaks onto a second line and pushes the toolbar to twice
                the height, on the one screen where vertical space is scarcest.
                aria-label carries the full wording either way. */}
            <span className={styles.labelLong}>Download CSV</span>
            <span className={styles.labelShort}>CSV</span>
          </button>
          <ReceiptsButton report={report} lookup={lookup} />
          <button
            type="button"
            className={styles.printBtn}
            onClick={() => window.print()}
            aria-label="Print or save as PDF"
          >
            <span className={styles.labelLong}>Print or save as PDF</span>
            <span className={styles.labelShort}>Print</span>
          </button>
        </div>
      </div>

      {drifted ? (
        <p className={styles.driftNotice}>
          Some covered transactions have changed since this report was sent. Reprinting it
          will not reproduce the document you submitted.
        </p>
      ) : null}

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
