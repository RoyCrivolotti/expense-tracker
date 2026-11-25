import type { Transaction } from '../../types'
import type { ExpenseReport } from '../../domain/engine/expenseReport'
import type { MoneyFormat } from '../../engine/money'
import type { Lookup } from '../format'
import { todayIso } from '../components/transactionFormState'
import { ExpenseReportSheet } from './ExpenseReportSheet'
import type { ReportEdits } from './reportViewState'
import { ReportControls } from './ReportControls'
import styles from './ExpenseReportView.module.css'

interface ReportBodyProps {
  /** The full claim, which the filter pills read; `report` is the one on show. */
  baseReport: ExpenseReport
  report: ExpenseReport | null
  receiptsOnly: boolean
  onReceiptsOnlyChange: (receiptsOnly: boolean) => void
  drifted: boolean
  receiptsLoading: boolean
  lookup: Lookup
  format: MoneyFormat
  claimantName: string
  currencyCode: string
  issuedOn: string | undefined
  edits: ReportEdits
  onOpenTransaction: ((txn: Transaction) => void) | undefined
}

/** What fills the overlay under the toolbar: the loading note, the sheet, or the empty-filter note. */
export function ReportBody({
  baseReport,
  report,
  receiptsOnly,
  onReceiptsOnlyChange,
  drifted,
  receiptsLoading,
  lookup,
  format,
  claimantName,
  currencyCode,
  issuedOn,
  edits,
  onOpenTransaction,
}: ReportBodyProps) {
  return (
    <>
      {/* Screen only, like the toolbar above it — the printed page is whichever
          version was on screen when Print was pressed. Aligned to the sheet's own
          column rather than the full-width toolbar, since it controls the sheet
          specifically and not the page. */}
      {receiptsLoading ? null : (
        <ReportControls
          report={baseReport}
          receiptsOnly={receiptsOnly}
          onReceiptsOnlyChange={onReceiptsOnlyChange}
          showNotes={edits.showNotes}
          onShowNotesChange={edits.setShowNotes}
        />
      )}

      {drifted ? (
        <p className={styles.driftNotice}>
          Some covered transactions have changed since this report was sent. Reprinting it will not reproduce the
          document you submitted.
        </p>
      ) : null}

      {receiptsLoading ? (
        <p className={styles.emptyNotice}>Loading receipts…</p>
      ) : report ? (
        <ExpenseReportSheet
          report={report}
          lookup={lookup}
          format={format}
          claimantName={claimantName}
          currencyCode={currencyCode}
          issuedOn={issuedOn ?? todayIso()}
          title={edits.title}
          onTitleChange={edits.setTitle}
          purpose={edits.purpose}
          onPurposeChange={edits.setPurpose}
          showNotes={edits.showNotes}
          onOpenTransaction={onOpenTransaction}
        />
      ) : (
        // Reachable only by turning the toggle on when nothing claimed has a
        // receipt yet — a fresh open of the report always has at least one line.
        <p className={styles.emptyNotice}>None of these items have a receipt attached yet.</p>
      )}
    </>
  )
}
