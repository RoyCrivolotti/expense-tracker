import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { PresenceValue } from '../components/Presence'
import { FlagsModal } from '../definitions/FlagsModal'
import { EXIT_MS } from '../hooks/motion'
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
      <PresenceValue value={reportFlagId} exitMs={EXIT_MS.fade}>
        {(flagId) => (
          // ExpenseReportView runs the identical buildFlagGroup check internally and
          // returns null itself when there's nothing to claim — this gate would only
          // ever agree with that one, and reads live data the leaf already holds.
          <ExpenseReportView
            dataset={model.dataset}
            lookup={model.lookup}
            flagId={flagId}
            onClose={onCloseReport}
            {...(actions ? { onOpenTransaction: actions.onEdit } : {})}
          />
        )}
      </PresenceValue>

      <PresenceValue value={pastPaymentId} exitMs={EXIT_MS.fade}>
        {(paymentId) => (
          <ExpenseReportView
            dataset={model.dataset}
            lookup={model.lookup}
            settledByPaymentId={paymentId}
            onClose={onClosePast}
            {...(actions ? { onOpenTransaction: actions.onEdit } : {})}
          />
        )}
      </PresenceValue>

      <PresenceValue value={viewingPast ? actions : null} exitMs={EXIT_MS.sheet}>
        {(shown) => (
          <PastReportsModal
            model={model}
            onClose={onCloseViewPast}
            onOpenReport={onOpenPastReport}
            onOpenPayment={shown.onEdit}
          />
        )}
      </PresenceValue>

      <PresenceValue value={managingFlags ? actions : null} exitMs={EXIT_MS.sheet}>
        {(shown) => (
          <FlagsModal
            model={model}
            actions={shown}
            onClose={onCloseManage}
            onOpenReport={onOpenReport}
          />
        )}
      </PresenceValue>
    </>
  )
}
