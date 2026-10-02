import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { detectRecurring, defaultBudgetMonth, type StatementPaymentRow } from '../../engine'
import { Money } from '../components/Money'
import { TransactionList } from '../components/TransactionList'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { PresenceValue } from '../components/Presence'
import { StatementPaymentSheet } from '../components/StatementPaymentSheet'
import { TxnFilters } from './TxnFilters'
import { UpcomingCard } from './UpcomingCard'
import { InstallmentsCard } from './InstallmentsCard'
import { FlaggedCard } from './FlaggedCard'
import { TransactionsFlagOverlays } from './TransactionsFlagOverlays'
import { TransactionsSelectFooter } from './TransactionsSelectFooter'
import { useTransactionsTabState } from './useTransactionsTabState'
import { scrollToResults } from './scrollToResults'
import { useDebouncedAnnouncement } from '../hooks/useDebouncedAnnouncement'
import { EXIT_MS } from '../hooks/motion'
import { useToast } from '../hooks/useToast'
import { FILTERS_LOCKED_HINT } from './selectionLockHints'
import { useReimbursement } from './useReimbursement'
import { usePastReports } from './usePastReports'
import { RecordReimbursementSheet } from './RecordReimbursementSheet'
import styles from './tabs.module.css'

/** "1 item", "0 items", "2 items" — pulled out only because this component is already
 * at the complexity ceiling; every other spot in the app inlines this same ternary. */
function itemCountLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`
}

/** The tapped row is a snapshot, so a date edit made in the sheet would never reach it.
 * The statement itself is current, and a filter cannot hide it while the sheet is open. */
function livePaidOn(model: ExpenseModel, row: StatementPaymentRow): string {
  const statement = model.dataset.accountStatements.find(
    (s) => s.accountId === row.cardAccountId && s.yearMonth === row.budgetMonth,
  )
  return statement?.paidOn ?? row.date
}

interface TransactionsTabProps {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
  /** Told when row selection starts and ends, so the shell can hold the month still. */
  onSelectModeChange?: ((selecting: boolean) => void) | undefined
  /** How many times the user has moved the header month. */
  monthNavigation?: number | undefined
}

export function TransactionsTab({
  model,
  month,
  actions,
  onSelectModeChange,
  monthNavigation,
}: TransactionsTabProps) {
  const state = useTransactionsTabState(model, month, actions, {
    onSelectModeChange,
    monthNavigation,
  })
  const [editingStatement, setEditingStatement] = useState<StatementPaymentRow | null>(null)
  const [statementPending, setStatementPending] = useState(false)
  const [managingFlags, setManagingFlags] = useState(false)
  const [clearingGroup, setClearingGroup] = useState<FlagGroup | null>(null)
  const reimbursement = useReimbursement(actions)
  const [reportFlagId, setReportFlagId] = useState<number | null>(null)
  const past = usePastReports(model.dataset.transactions)
  const rolloverDay = model.dataset.settings.budgetRolloverDay
  const announcement = useDebouncedAnnouncement(
    `${state.listRows.length} transactions match`,
  )
  const upcoming = useMemo(
    () => detectRecurring(model.dataset.transactions, { forBudgetMonth: month, rolloverDay }),
    [model.dataset, month, rolloverDay],
  )
  const { showToast } = useToast()
  const explainFilterLock = () => showToast(FILTERS_LOCKED_HINT)

  return (
    <div className={`${styles.stack} ${styles.txnStack}`}>
      {actions && (
        <>
          <FlaggedCard
            model={model}
            onFilterByFlag={(flagId) => {
              // Jumping from the (all-time) card into the (month-scoped) list
              // has to widen the date scope too, or the rows you just clicked
              // through mostly vanish.
              state.setFlagId(flagId)
              state.setDateScope('allDates')
              scrollToResults()
            }}
            filterLocked={state.selectMode}
            onLockedFilterPress={explainFilterLock}
            onOpenReport={setReportFlagId}
            onSettle={reimbursement.open}
            onManage={() => setManagingFlags(true)}
            onViewPast={past.entry}
            onSelect={actions.onEdit}
            onClearFlag={(txn) => {
              void actions.updateTransaction(txn.id, { flagId: null }).catch((error: unknown) => {
                showToast(error instanceof Error ? error.message : 'Could not clear the flag', 'error')
              })
            }}
            onClearGroup={setClearingGroup}
          />
          <InstallmentsCard model={model} actions={actions} month={month} />
          {upcoming.length > 0 && (
            <UpcomingCard suggestions={upcoming} lookup={model.lookup} onAdd={actions.onAdd} />
          )}
        </>
      )}

      <TxnFilters
        categories={model.dataset.categories}
        accounts={model.dataset.accounts}
        flags={model.dataset.flags}
        labels={model.dataset.labels}
        query={state.query}
        status={state.status}
        categoryId={state.categoryId}
        accountId={state.accountId}
        flagId={state.flagId}
        labelIds={state.labelIds}
        txnType={state.txnType}
        dateScope={state.dateScope}
        customDateFrom={state.customDateFrom}
        customDateTo={state.customDateTo}
        selectMode={state.selectMode}
        selectBusy={state.busy}
        canSelect={state.canDelete}
        secondaryFilterCount={state.secondaryFilterCount}
        hasActiveFilters={state.hasActiveFilters}
        summary={
          <span className={styles.resultStats}>
            <span>{itemCountLabel(state.listRows.length)}</span>
            <span>
              <span className={styles.resultLabel}>Net spend </span>
              <span className={styles.resultAmount}>
                <Money cents={state.totalCents} signed={state.totalCents < 0} />
              </span>
            </span>
          </span>
        }
        onClearFilters={state.clearFilters}
        onQuery={state.setQuery}
        onCategory={state.setCategoryId}
        onAccount={state.setAccountId}
        onFlag={state.setFlagId}
        onLabelIds={state.setLabelIds}
        onStatus={state.setStatus}
        onTxnType={state.setTxnType}
        onDateScope={state.setDateScope}
        onCustomDateFrom={state.setCustomDateFrom}
        onCustomDateTo={state.setCustomDateTo}
        onToggleSelectMode={state.toggleSelectMode}
        onLockedPress={explainFilterLock}
      />

      {/*
        The announcement is a separate, debounced node rather than role=status on
        the visible summary: that fired on every keystroke in the search box, so
        a screen reader read a new total for each letter typed.
      */}
      <p className={styles.visuallyHidden} role="status">
        {announcement}
      </p>
      <TransactionList
        rows={state.listRows}
        lookup={model.lookup}
        selectMode={state.selectMode}
        selectedIds={state.selected}
        swipeDelete={state.isMobile && state.canDelete && !state.selectMode}
        {...(state.hasActiveFilters ? { onClearFilters: state.clearFilters } : {})}
        {...(actions ? { onSelect: actions.onEdit, onDuplicate: actions.onDuplicate } : {})}
        onToggleSelect={state.toggleSelected}
        onToggleDate={state.toggleDate}
        {...(actions
          ? {
              onAddForDate: (date) =>
                actions.onAdd({ date, budgetMonth: defaultBudgetMonth(date, rolloverDay) }),
              onDelete: actions.deleteTransaction,
              onLongPressSelect: state.enterAndSelect,
              onEditStatementPayment: setEditingStatement,
            }
          : {})}
      />

      <PresenceValue value={actions ? editingStatement : null} exitMs={EXIT_MS.sheet}>
        {(statement) =>
          actions && (
            <StatementPaymentSheet
              cardName={statement.cardName}
              yearMonth={statement.budgetMonth}
              amountCents={statement.amountCents}
              paid
              paidOn={livePaidOn(model, statement)}
              disabled={statementPending}
              onClose={() => setEditingStatement(null)}
              onSave={async (paid, paidOn) => {
                setStatementPending(true)
                try {
                  await actions.setStatementPaid(
                    statement.cardAccountId,
                    statement.budgetMonth,
                    paid,
                    paidOn,
                  )
                } finally {
                  setStatementPending(false)
                }
              }}
            />
          )
        }
      </PresenceValue>

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

      <PresenceValue value={actions ? clearingGroup : null} exitMs={EXIT_MS.sheet}>
        {(group) =>
          actions && (
            <ConfirmSheet
              title={`Clear ${group.flag.name}?`}
              message={`${itemCountLabel(group.count)} will lose this flag. You can re-flag them individually afterwards.`}
              confirmLabel="Clear all"
              onConfirm={() => {
                setClearingGroup(null)
                void actions
                  .updateTransactions(
                    group.transactions.map((t) => t.id),
                    { flagId: null },
                  )
                  .catch((error: unknown) => {
                    showToast(
                      error instanceof Error ? error.message : 'Could not clear the flag',
                      'error',
                    )
                  })
              }}
              onCancel={() => setClearingGroup(null)}
            />
          )
        }
      </PresenceValue>

      <TransactionsFlagOverlays
        model={model}
        actions={actions}
        reportFlagId={reportFlagId}
        onCloseReport={() => setReportFlagId(null)}
        onOpenReport={setReportFlagId}
        pastPaymentId={past.paymentId}
        onClosePast={past.closeReport}
        managingFlags={managingFlags}
        onCloseManage={() => setManagingFlags(false)}
        viewingPast={past.listing}
        onCloseViewPast={past.closeList}
        onOpenPastReport={past.openReport}
      />

      <TransactionsSelectFooter
        actionsEnabled={Boolean(actions)}
        actions={actions}
        selection={state}
        visibleIds={state.visibleIds}
        model={model}
      />
    </div>
  )
}
