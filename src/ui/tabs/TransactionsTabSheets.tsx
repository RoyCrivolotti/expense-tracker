import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { StatementPaymentRow } from '../../engine'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { PresenceValue } from '../components/Presence'
import { StatementPaymentSheet } from '../components/StatementPaymentSheet'
import { EXIT_MS } from '../hooks/motion'
import { useToast } from '../hooks/useToast'
import { RecordReimbursementSheet } from './RecordReimbursementSheet'
import { TransactionsFlagOverlays } from './TransactionsFlagOverlays'
import { TransactionsSelectFooter } from './TransactionsSelectFooter'
import { itemCountLabel, livePaidOn } from './transactionsTabHelpers'
import type { TabState } from './TransactionsTabParts'
import type { TabOverlays } from './useTabOverlays'

interface StatementSheetProps {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  statement: StatementPaymentRow | null
  pending: boolean
  setPending: (pending: boolean) => void
  onClose: () => void
}

export function StatementSheet({
  model,
  actions,
  statement: editing,
  pending,
  setPending,
  onClose,
}: StatementSheetProps) {
  return (
    <PresenceValue value={actions ? editing : null} exitMs={EXIT_MS.sheet}>
      {(statement) =>
        actions && (
          <StatementPaymentSheet
            cardName={statement.cardName}
            yearMonth={statement.budgetMonth}
            amountCents={statement.amountCents}
            paid
            paidOn={livePaidOn(model, statement)}
            disabled={pending}
            onClose={() => onClose()}
            onSave={async (paid, paidOn) => {
              setPending(true)
              try {
                await actions.setStatementPaid(statement.cardAccountId, statement.budgetMonth, paid, paidOn)
              } finally {
                setPending(false)
              }
            }}
          />
        )
      }
    </PresenceValue>
  )
}

interface ClearGroupProps {
  actions: ExpenseActions | undefined
  group: FlagGroup | null
  onClose: () => void
}

export function ClearGroupSheet({ actions, group: clearingGroup, onClose }: ClearGroupProps) {
  const { showToast } = useToast()
  return (
    <PresenceValue value={actions ? clearingGroup : null} exitMs={EXIT_MS.sheet}>
      {(group) =>
        actions && (
          <ConfirmSheet
            title={`Clear ${group.flag.name}?`}
            message={`${itemCountLabel(group.count)} will lose this flag. You can re-flag them individually afterwards.`}
            confirmLabel="Clear all"
            onConfirm={() => {
              onClose()
              void actions
                .updateTransactions(
                  group.transactions.map((t) => t.id),
                  { flagId: null },
                )
                .catch((error: unknown) => {
                  showToast(error instanceof Error ? error.message : 'Could not clear the flag', 'error')
                })
            }}
            onCancel={() => onClose()}
          />
        )
      }
    </PresenceValue>
  )
}

function ReimbursementSheet({
  model,
  actions,
  reimbursement,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  reimbursement: TabOverlays['reimbursement']
}) {
  return (
    <PresenceValue value={actions ? reimbursement.group : null} exitMs={EXIT_MS.sheet}>
      {(group) => (
        <RecordReimbursementSheet
          group={group}
          model={model}
          busy={reimbursement.busy}
          error={reimbursement.error}
          onCancel={reimbursement.cancel}
          onRecord={reimbursement.record}
        />
      )}
    </PresenceValue>
  )
}

interface SheetsProps {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  state: TabState
  overlays: TabOverlays
}

/** Every sheet and overlay the tab can open, after the list. */
export function TabSheets({ model, actions, state, overlays }: SheetsProps) {
  const { past, reimbursement } = overlays
  return (
    <>
      <StatementSheet
        model={model}
        actions={actions}
        statement={overlays.editingStatement}
        pending={overlays.statementPending}
        setPending={overlays.setStatementPending}
        onClose={() => overlays.setEditingStatement(null)}
      />

      <ReimbursementSheet model={model} actions={actions} reimbursement={reimbursement} />

      <ClearGroupSheet
        actions={actions}
        group={overlays.clearingGroup}
        onClose={() => overlays.setClearingGroup(null)}
      />

      <TransactionsFlagOverlays
        model={model}
        actions={actions}
        reportFlagId={overlays.reportFlagId}
        onCloseReport={() => overlays.setReportFlagId(null)}
        onOpenReport={overlays.setReportFlagId}
        pastPaymentId={past.paymentId}
        onClosePast={past.closeReport}
        managingFlags={overlays.managingFlags}
        onCloseManage={() => overlays.setManagingFlags(false)}
        viewingPast={past.listing}
        onCloseViewPast={past.closeList}
        onOpenPastReport={past.openReport}
      />

      <TransactionsSelectFooter
        actionsEnabled={Boolean(actions)}
        actions={actions}
        selection={state}
        visibleIds={state.visibleIds}
        rows={state.results}
        model={model}
        partial={state.partial}
      />
    </>
  )
}
