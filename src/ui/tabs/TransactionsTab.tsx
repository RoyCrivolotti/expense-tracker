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
import { TransactionsSelectFooter } from './TransactionsSelectFooter'
import { useTransactionsTabState } from './useTransactionsTabState'
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
  const upcoming = useMemo(
    () => detectRecurring(model.dataset.transactions, { forBudgetMonth: month }),
    [model.dataset, month],
  )

  return (
    <div className={styles.stack}>
      {actions && (
        <>
          <InstallmentsCard model={model} actions={actions} month={month} />
          {upcoming.length > 0 && (
            <UpcomingCard suggestions={upcoming} lookup={model.lookup} onAdd={actions.onAdd} />
          )}
        </>
      )}

      <TxnFilters
        categories={model.dataset.categories}
        accounts={model.dataset.accounts}
        query={state.query}
        status={state.status}
        categoryId={state.categoryId}
        accountId={state.accountId}
        txnType={state.txnType}
        dateScope={state.dateScope}
        customDateFrom={state.customDateFrom}
        customDateTo={state.customDateTo}
        selectMode={state.selectMode}
        canSelect={state.canDelete}
        secondaryFilterCount={state.secondaryFilterCount}
        onQuery={state.setQuery}
        onCategory={state.setCategoryId}
        onAccount={state.setAccountId}
        onStatus={state.setStatus}
        onTxnType={state.setTxnType}
        onDateScope={state.setDateScope}
        onCustomDateFrom={state.setCustomDateFrom}
        onCustomDateTo={state.setCustomDateTo}
        onToggleSelectMode={state.toggleSelectMode}
      />

      <div className={styles.resultSummary}>
        {state.hasActiveFilters && !state.selectMode ? (
          <button type="button" className={styles.filterClear} onClick={state.clearFilters}>
            Clear filters
          </button>
        ) : (
          <span />
        )}
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
                actions.onAdd({ date, budgetMonth: defaultBudgetMonth(date) }),
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

      <TransactionsSelectFooter actionsEnabled={Boolean(actions)} selection={state} />
    </div>
  )
}
