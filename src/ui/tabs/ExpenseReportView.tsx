import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExpenseDataset, Transaction } from '../../types'
import { pastReportDrifted } from '../../domain/engine/pastReports'
import { exitVars } from '../hooks/motion'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useExit, useHeldWhileLeaving } from '../hooks/usePresence'
import type { Lookup } from '../format'
import { ReportBody } from './ReportBody'
import { ReportToolbar } from './ReportToolbar'
import {
  baseReportOf,
  shownReport,
  useDocumentTitle,
  useReceiptsLoading,
  useReportEdits,
  useReportOpenFlag,
} from './reportViewState'
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
  /** Reads the receipt lists of the report's rows, for a model that reads them on request. */
  ensureReceipts?: ((ids: readonly number[]) => void) | undefined
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
  dataset: liveDataset,
  lookup,
  flagId,
  settledByPaymentId,
  onClose,
  onOpenTransaction,
  issuedOn,
  ensureReceipts,
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
  const baseReport = baseReportOf(dataset, flagId, settledByPaymentId)

  const edits = useReportEdits(baseReport)
  useReportOpenFlag(baseReport)

  // Session-only, like the toolbar itself: reopening the report starts from
  // the full claim again.
  const [receiptsOnly, setReceiptsOnly] = useState(false)

  const report = shownReport(baseReport, receiptsOnly)

  useDocumentTitle(edits.title, report)

  const receiptsLoading = useReceiptsLoading(baseReport, lookup, ensureReceipts)

  if (!baseReport) return null

  // Only a reopened report can have drifted: an open claim has nothing submitted
  // to differ from yet.
  const drifted = settledByPaymentId != null && pastReportDrifted(settledByPaymentId, dataset.transactions)

  return createPortal(
    <div
      className={leaving ? `${styles.overlay} ${styles.overlayLeaving}` : styles.overlay}
      style={exitVars(leaving, exitMs)}
      inert={leaving}
    >
      <ReportToolbar
        onClose={onClose}
        report={report}
        receiptsLoading={receiptsLoading}
        lookup={lookup}
        format={format}
        claimantName={dataset.settings.claimantName}
        edits={edits}
      />

      <ReportBody
        baseReport={baseReport}
        report={report}
        receiptsOnly={receiptsOnly}
        onReceiptsOnlyChange={setReceiptsOnly}
        drifted={drifted}
        receiptsLoading={receiptsLoading}
        lookup={lookup}
        format={format}
        claimantName={dataset.settings.claimantName}
        currencyCode={dataset.settings.currencyCode}
        issuedOn={issuedOn}
        edits={edits}
        onOpenTransaction={onOpenTransaction}
      />
    </div>,
    document.body,
  )
}
