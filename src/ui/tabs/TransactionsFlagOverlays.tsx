import { buildFlagGroup } from '../../domain/engine/flagGroups'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { FlagsModal } from '../definitions/FlagsModal'
import { ExpenseReportView } from './ExpenseReportView'
import { PastReportsModal } from './PastReportsModal'

/**
 * The two full-screen surfaces the Flagged card can open. Extracted so
 * TransactionsTab stays under the complexity budget — it already juggles the
 * list, the filters, selection and the statement sheet, and these two are
 * independent of all of it.
 */
export function TransactionsFlagOverlays({
  model,
  actions,
  reportFlagId,
  onCloseReport,
  onOpenReport,
  pastPaymentId,
  onClosePast,
  managingFlags,
  onCloseManage,
  viewingPast,
  onCloseViewPast,
  onOpenPastReport,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  reportFlagId: number | null
  onCloseReport: () => void
  onOpenReport: (flagId: number) => void
  /** A past report, rebuilt from the payment that settled it. */
  pastPaymentId: number | null
  onClosePast: () => void
  managingFlags: boolean
  onCloseManage: () => void
  viewingPast: boolean
  onCloseViewPast: () => void
  onOpenPastReport: (paymentId: number) => void
}) {
  return (
    <>
      {reportFlagId != null && buildFlagGroup(reportFlagId, model.dataset.transactions, model.dataset.flags) ? (
        <ExpenseReportView
          dataset={model.dataset}
          lookup={model.lookup}
          flagId={reportFlagId}
          onClose={onCloseReport}
          {...(actions ? { onOpenTransaction: actions.onEdit } : {})}
        />
      ) : null}

      {pastPaymentId != null ? (
        <ExpenseReportView
          dataset={model.dataset}
          lookup={model.lookup}
          settledByPaymentId={pastPaymentId}
          onClose={onClosePast}
          {...(actions ? { onOpenTransaction: actions.onEdit } : {})}
        />
      ) : null}

      {viewingPast && actions ? (
        <PastReportsModal
          model={model}
          onClose={onCloseViewPast}
          onOpenReport={onOpenPastReport}
          onOpenPayment={actions.onEdit}
        />
      ) : null}

      {managingFlags && actions ? (
        <FlagsModal
          model={model}
          actions={actions}
          onClose={onCloseManage}
          onOpenReport={onOpenReport}
        />
      ) : null}
    </>
  )
}
