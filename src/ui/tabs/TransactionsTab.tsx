import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { detectRecurring, defaultBudgetMonth, type StatementPaymentRow } from '../../engine'
import { Money } from '../components/Money'
import { TransactionList } from '../components/TransactionList'
import { StatementPaymentSheet } from '../components/StatementPaymentSheet'
import { TxnFilters } from './TxnFilters'
import { UpcomingCard } from './UpcomingCard'
import { InstallmentsCard } from './InstallmentsCard'
import { FlaggedCard } from './FlaggedCard'
import { FlagsModal } from '../definitions/FlagsModal'
import { TransactionsSelectFooter } from './TransactionsSelectFooter'
import { useTransactionsTabState } from './useTransactionsTabState'
import { RESULTS_ANCHOR_ID, scrollToResults } from './scrollToResults'
import styles from './tabs.module.css'

interface TransactionsTabProps {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
}

export function TransactionsTab({ model, month, actions }: TransactionsTabProps) {
  const state = useTransactionsTabState(model, month, actions)
  const [editingStatement, setEditingStatement] = useState<StatementPaymentRow | null>(null)
  const [statementPending, setStatementPending] = useState(false)
  const [managingFlags, setManagingFlags] = useState(false)
  const rolloverDay = model.dataset.settings.budgetRolloverDay
  const upcoming = useMemo(
    () => detectRecurring(model.dataset.transactions, { forBudgetMonth: month, rolloverDay }),
    [model.dataset, month, rolloverDay],
  )

  return (
    <div className={styles.stack}>
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
            onManage={() => setManagingFlags(true)}
            onSelect={actions.onEdit}
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
        query={state.query}
        status={state.status}
        categoryId={state.categoryId}
        accountId={state.accountId}
        flagId={state.flagId}
        txnType={state.txnType}
        dateScope={state.dateScope}
        customDateFrom={state.customDateFrom}
        customDateTo={state.customDateTo}
        selectMode={state.selectMode}
        canSelect={state.canDelete}
        secondaryFilterCount={state.secondaryFilterCount}
        hasActiveFilters={state.hasActiveFilters}
        onClearFilters={state.clearFilters}
        onQuery={state.setQuery}
        onCategory={state.setCategoryId}
        onAccount={state.setAccountId}
        onFlag={state.setFlagId}
        onStatus={state.setStatus}
        onTxnType={state.setTxnType}
        onDateScope={state.setDateScope}
        onCustomDateFrom={state.setCustomDateFrom}
        onCustomDateTo={state.setCustomDateTo}
        onToggleSelectMode={state.toggleSelectMode}
      />

      {/* role=status, so applying a filter announces the new result count
          instead of changing the list silently. */}
      <div id={RESULTS_ANCHOR_ID} className={styles.resultSummary} role="status">
        <span className={styles.resultStats}>
          <span>{state.listRows.length} items</span>
          <span>
            Net spend <Money cents={state.totalCents} />
          </span>
        </span>
      </div>

      <TransactionList
        rows={state.listRows}
        lookup={model.lookup}
        selectMode={state.selectMode}
        selectedIds={state.selected}
        swipeDelete={state.isMobile && state.canDelete && !state.selectMode}
        {...(state.hasActiveFilters ? { onClearFilters: state.clearFilters } : {})}
        {...(actions ? { onSelect: actions.onEdit, onDuplicate: actions.onDuplicate } : {})}
        {...(actions
          ? {
              onAddForDate: (date) =>
                actions.onAdd({ date, budgetMonth: defaultBudgetMonth(date, rolloverDay) }),
              onDelete: actions.deleteTransaction,
              onToggleSelect: state.toggleSelected,
              onToggleDate: state.toggleDate,
              onEditStatementPayment: setEditingStatement,
            }
          : {})}
      />

      {editingStatement && actions ? (
        <StatementPaymentSheet
          cardName={editingStatement.cardName}
          yearMonth={editingStatement.budgetMonth}
          amountCents={editingStatement.amountCents}
          paid
          paidOn={editingStatement.date}
          disabled={statementPending}
          onClose={() => setEditingStatement(null)}
          onSave={async (paid, paidOn) => {
            setStatementPending(true)
            try {
              await actions.setStatementPaid(
                editingStatement.cardAccountId,
                editingStatement.budgetMonth,
                paid,
                paidOn,
              )
            } finally {
              setStatementPending(false)
            }
          }}
        />
      ) : null}

      {managingFlags && actions ? (
        <FlagsModal model={model} actions={actions} onClose={() => setManagingFlags(false)} />
      ) : null}

      <TransactionsSelectFooter actionsEnabled={Boolean(actions)} selection={state} model={model} />
    </div>
  )
}
