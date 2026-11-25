import type { ExpenseReport } from '../../domain/engine/expenseReport'
import type { MoneyFormat } from '../../engine/money'
import { downloadExpenseReportCsv } from '../../data/expenseReportCsv'
import type { Lookup } from '../format'
import { ReceiptsButton } from './ReportReceiptsButton'
import type { ReportEdits } from './reportViewState'
import styles from './ExpenseReportView.module.css'

/** Back, and the three ways out of the report: CSV, the receipts on their own, and print. */
export function ReportToolbar({
  onClose,
  report,
  receiptsLoading,
  lookup,
  format,
  claimantName,
  edits,
}: {
  onClose: () => void
  report: ExpenseReport | null
  receiptsLoading: boolean
  lookup: Lookup
  format: MoneyFormat
  claimantName: string
  edits: ReportEdits
}) {
  return (
    <div className={styles.toolbar}>
      <button type="button" className={styles.closeBtn} onClick={onClose}>
        Back
      </button>
      {report && !receiptsLoading ? (
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() =>
              downloadExpenseReportCsv(report, {
                format,
                categoryName: lookup.categoryName,
                accountName: lookup.accountName,
                claimantName,
                title: edits.title,
                purpose: edits.purpose,
                showNotes: edits.showNotes,
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
          <ReceiptsButton report={report} lookup={lookup} title={edits.title} />
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
  )
}
