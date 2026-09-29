import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExpenseDataset, Transaction } from '../../types'
import {
  buildExpenseReport,
  buildSettledReport,
  receiptsOnlyReport,
  reportReceipts,
  type ExpenseReport,
} from '../../domain/engine/expenseReport'
import { pastReportDrifted } from '../../domain/engine/pastReports'
import { SegmentedControl } from '../components/SegmentedControl'
import { ExpenseReportSheet } from './ExpenseReportSheet'
import { todayIso } from '../components/transactionFormState'
import { exitVars } from '../hooks/motion'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useExit, useHeldWhileLeaving } from '../hooks/usePresence'
import { downloadExpenseReportCsv } from '../../data/expenseReportCsv'
import { deliverReceipts } from '../../data/receiptDownload'
import { namedReceipts, receiptPackName } from '../../domain/engine/receiptFiles'
import type { Lookup } from '../format'
import styles from './ExpenseReportView.module.css'

const RECEIPT_FILTER_OPTIONS: { value: 'all' | 'receipted'; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'receipted', label: 'With receipt' },
]

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
function ReceiptsButton({
  report,
  lookup,
  title,
}: {
  report: ExpenseReport
  lookup: Lookup
  title: string
}) {
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
        receiptPackName(title, report.from),
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

/**
 * The all-items/with-receipt pill above the sheet.
 *
 * Its own component so the view keeps its branch count. Hidden entirely
 * rather than disabled when nothing is missing a receipt: the filter would
 * have nothing left to do, and the count is already shown in the sheet
 * itself, so a dimmed control here would just be a second copy of it.
 */
function ReceiptFilterControl({
  hasMissingReceipts,
  receiptsOnly,
  onChange,
}: {
  hasMissingReceipts: boolean
  receiptsOnly: boolean
  onChange: (receiptsOnly: boolean) => void
}) {
  if (!hasMissingReceipts) return null
  return (
    <div className={styles.reportControls}>
      <SegmentedControl
        options={RECEIPT_FILTER_OPTIONS}
        value={receiptsOnly ? 'receipted' : 'all'}
        onChange={(value) => onChange(value === 'receipted')}
        ariaLabel="Filter the report by receipt"
      />
    </div>
  )
}

export function ExpenseReportView({
  dataset: liveDataset,
  lookup,
  flagId,
  settledByPaymentId,
  onClose,
  onOpenTransaction,
  issuedOn,
}: Props) {
  const format = useMoneyFormat()
  const { leaving, exitMs } = useExit()
  // Frozen for the exit, the same way ConfigModal holds its model — otherwise a claim
  // changing underneath a fading report (its last transaction edited or removed from a
  // stacked editor, a sync landing) can reword it mid-fade or return null and cut the
  // exit short, exactly what Presence exists to prevent.
  const dataset = useHeldWhileLeaving(liveDataset)

  /*
   * The overlay is portalled out of #root and flags the body while it is open,
   * so a global print rule can hide the app behind it. Printing the app tree as
   * well would put the nav, the FAB and the month's transactions into the PDF
   * the user is about to hand to somebody.
   */
  const baseReport =
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

  // Defaults to the flag's name and lives only for this visit: nothing about a
  // report is stored, so there is nowhere to keep an edited title between
  // visits without inventing storage for a document that rebuilds itself fresh
  // every time it is opened.
  const [title, setTitle] = useState(() => baseReport?.flag.name ?? '')

  /*
   * Guarded on `baseReport`, and declared before the early return so the hook order
   * is stable. Setting the flag unconditionally meant an empty report rendered
   * nothing while leaving `<body data-report-open>` set for the rest of the
   * session — and theme.css hides #root under that attribute when printing, so
   * Cmd+P anywhere in the app produced a blank page until reload.
   */
  useEffect(() => {
    if (!baseReport) return
    document.body.dataset.reportOpen = 'true'
    return () => {
      delete document.body.dataset.reportOpen
    }
  }, [baseReport])

  // Session-only, like the toolbar itself: reopening the report starts from
  // the full claim again.
  const [receiptsOnly, setReceiptsOnly] = useState(false)

  if (!baseReport) return null

  // Null only when every line left has no receipt — reachable by toggling the
  // filter on a claim that turns out to have none, not by anything a fresh
  // open of the report can produce.
  const report = receiptsOnly ? receiptsOnlyReport(baseReport) : baseReport

  // Only a reopened report can have drifted: an open claim has nothing submitted
  // to differ from yet.
  const drifted =
    settledByPaymentId != null && pastReportDrifted(settledByPaymentId, dataset.transactions)

  return createPortal(
    <div
      className={leaving ? `${styles.overlay} ${styles.overlayLeaving}` : styles.overlay}
      style={exitVars(leaving, exitMs)}
      inert={leaving}
    >
      <div className={styles.toolbar}>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Back
        </button>
        {report ? (
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
                  title,
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
            <ReceiptsButton report={report} lookup={lookup} title={title} />
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
        ) : null}
      </div>

      {/* Screen only, like the toolbar above it — the printed page is whichever
          version was on screen when Print was pressed. Aligned to the sheet's own
          column rather than the full-width toolbar, since it controls the sheet
          specifically and not the page. */}
      <ReceiptFilterControl
        hasMissingReceipts={baseReport.missingReceipts.length > 0}
        receiptsOnly={receiptsOnly}
        onChange={setReceiptsOnly}
      />

      {drifted ? (
        <p className={styles.driftNotice}>
          Some covered transactions have changed since this report was sent. Reprinting it
          will not reproduce the document you submitted.
        </p>
      ) : null}

      {report ? (
        <ExpenseReportSheet
          report={report}
          lookup={lookup}
          format={format}
          claimantName={dataset.settings.claimantName}
          currencyCode={dataset.settings.currencyCode}
          issuedOn={issuedOn ?? todayIso()}
          title={title}
          onTitleChange={setTitle}
          onOpenTransaction={onOpenTransaction}
        />
      ) : (
        // Reachable only by turning the toggle on when nothing claimed has a
        // receipt yet — a fresh open of the report always has at least one line.
        <p className={styles.emptyNotice}>
          None of these items have a receipt attached yet.
        </p>
      )}
    </div>,
    document.body,
  )
}
