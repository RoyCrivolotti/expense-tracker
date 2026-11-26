import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { StatementPaymentRow } from '../../engine'
import { TransactionList } from '../components/TransactionList'
import { ListStats } from './ListStats'
import { TxnFilters } from './TxnFilters'
import { UpcomingSlot } from './UpcomingSlot'
import { InstallmentsCard } from './InstallmentsCard'
import { FlaggedCard } from './FlaggedCard'
import { TransactionsTips } from '../tips/TransactionsTips'
import type { useTransactionsTabState } from './useTransactionsTabState'
import { scrollToResults } from './scrollToResults'
import { useToast } from '../hooks/useToast'
import { dayHeaderSeed } from './dayHeaderSeed'
import type { TabOverlays } from './useTabOverlays'

export type TabState = ReturnType<typeof useTransactionsTabState>

interface CardsProps {
  model: ExpenseModel
  month: string
  actions: ExpenseActions
  state: TabState
  overlays: TabOverlays
  onLockedFilterPress: () => void
}

/** The tips and the flagged, installments and upcoming cards above the filters. */
export function TransactionsCards({ model, month, actions, state, overlays, onLockedFilterPress }: CardsProps) {
  const { reimbursement, past } = overlays
  const { showToast } = useToast()
  return (
    <>
      <TransactionsTips model={model} phone={state.isMobile} />
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
        onLockedFilterPress={onLockedFilterPress}
        onOpenReport={overlays.setReportFlagId}
        onSettle={reimbursement.open}
        onManage={() => overlays.setManagingFlags(true)}
        onViewPast={past.entry}
        onSelect={actions.onEdit}
        onClearFlag={(txn) => {
          void actions.updateTransaction(txn.id, { flagId: null }).catch((error: unknown) => {
            showToast(error instanceof Error ? error.message : 'Could not clear the flag', 'error')
          })
        }}
        onClearGroup={overlays.setClearingGroup}
      />
      <InstallmentsCard model={model} actions={actions} month={month} />
      <UpcomingSlot model={model} month={month} onAdd={actions.onAdd} />
    </>
  )
}

export function FiltersBar({
  model,
  state,
  onLockedPress,
}: {
  model: ExpenseModel
  state: TabState
  onLockedPress: () => void
}) {
  return (
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
      amountMin={state.amountMin}
      amountMax={state.amountMax}
      amountMinCents={state.amountMinCents}
      amountMaxCents={state.amountMaxCents}
      dateScope={state.dateScope}
      customDateFrom={state.customDateFrom}
      customDateTo={state.customDateTo}
      selectMode={state.selectMode}
      selectBusy={state.busy}
      canSelect={state.canDelete}
      secondaryFilterCount={state.secondaryFilterCount}
      hasActiveFilters={state.hasActiveFilters}
      summary={
        <ListStats count={state.count} capped={state.capped} totalCents={state.totalCents} stale={state.totalsStale} />
      }
      onClearFilters={state.clearFilters}
      onQuery={state.setQuery}
      onCategory={state.setCategoryId}
      onAccount={state.setAccountId}
      onFlag={state.setFlagId}
      onLabelIds={state.setLabelIds}
      onStatus={state.setStatus}
      onTxnType={state.setTxnType}
      onAmountMin={state.setAmountMin}
      onAmountMax={state.setAmountMax}
      onDateScope={state.setDateScope}
      onCustomDateFrom={state.setCustomDateFrom}
      onCustomDateTo={state.setCustomDateTo}
      onToggleSelectMode={state.toggleSelectMode}
      onLockedPress={onLockedPress}
    />
  )
}

interface ResultsProps {
  model: ExpenseModel
  month: string
  actions: ExpenseActions | undefined
  state: TabState
  onEditStatement: (row: StatementPaymentRow) => void
}

export function ResultsList({ model, month, actions, state, onEditStatement }: ResultsProps) {
  return (
    <TransactionList
      rows={state.listRows}
      loading={state.loading}
      emptyState={state.failed}
      accountEmpty={model.months.length === 0}
      canAdd={Boolean(actions)}
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
            onAddForDate: (date) => actions.onAdd(dayHeaderSeed(model, month, state.dateScope, date)),
            onDelete: actions.deleteTransaction,
            onLongPressSelect: state.enterAndSelect,
            onEditStatementPayment: onEditStatement,
          }
        : {})}
    />
  )
}
