import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { FlagsModal } from '../definitions/FlagsModal'
import { ReimbursementPackView } from './ReimbursementPackView'

/**
 * The two full-screen surfaces the Flagged card can open. Extracted so
 * TransactionsTab stays under the complexity budget — it already juggles the
 * list, the filters, selection and the statement sheet, and these two are
 * independent of all of it.
 */
export function TransactionsFlagOverlays({
  model,
  actions,
  packFlagId,
  onClosePack,
  onOpenPack,
  managingFlags,
  onCloseManage,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  packFlagId: number | null
  onClosePack: () => void
  onOpenPack: (flagId: number) => void
  managingFlags: boolean
  onCloseManage: () => void
}) {
  return (
    <>
      {packFlagId != null ? (
        <ReimbursementPackView
          dataset={model.dataset}
          lookup={model.lookup}
          flagId={packFlagId}
          onClose={onClosePack}
          {...(actions ? { onOpenTransaction: actions.onEdit } : {})}
        />
      ) : null}

      {managingFlags && actions ? (
        <FlagsModal
          model={model}
          actions={actions}
          onClose={onCloseManage}
          onOpenPack={onOpenPack}
        />
      ) : null}
    </>
  )
}
