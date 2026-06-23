import { useMemo } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { detectRecurring } from '../../engine'
import { Money } from '../components/Money'
import { TransactionList } from '../components/TransactionList'
import { BatchBar } from './BatchBar'
import { TxnFilters } from './TxnFilters'
import { UpcomingCard } from './UpcomingCard'
import { useTransactionsTabState } from './useTransactionsTabState'
import styles from './tabs.module.css'

interface TransactionsTabProps {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
}

export function TransactionsTab({ model, month, actions }: TransactionsTabProps) {
  const state = useTransactionsTabState(model, month, actions)
  const upcoming = useMemo(
    () => detectRecurring(model.dataset.transactions, { forBudgetMonth: month }),
    [model.dataset, month],
  )

  return (
    <div className={styles.stack}>
      {actions && upcoming.length > 0 && (
        <UpcomingCard suggestions={upcoming} lookup={model.lookup} onAdd={actions.onAdd} />
      )}

      <TxnFilters
        categories={model.dataset.categories}
        accounts={model.dataset.accounts}
        query={state.query}
        status={state.status}
        categoryId={state.categoryId}
        accountId={state.accountId}
        txnType={state.txnType}
        useDateRange={state.useDateRange}
        dateFrom={state.dateFrom}
        dateTo={state.dateTo}
        selectMode={state.selectMode}
        canSelect={state.canDelete}
        onQuery={state.setQuery}
        onCategory={state.setCategoryId}
        onAccount={state.setAccountId}
        onStatus={state.setStatus}
        onTxnType={state.setTxnType}
        onUseDateRange={state.setUseDateRange}
        onDateFrom={state.setDateFrom}
        onDateTo={state.setDateTo}
        onToggleSelectMode={state.toggleSelectMode}
      />

      <div className={styles.resultSummary}>
        <span>{state.results.length} transactions</span>
        <span>
          Net spend <Money cents={state.totalCents} />
        </span>
      </div>

      <TransactionList
        transactions={state.results}
        lookup={model.lookup}
        selectMode={state.selectMode}
        selectedIds={state.selected}
        swipeDelete={state.isMobile && state.canDelete && !state.selectMode}
        {...(actions ? { onSelect: actions.onEdit } : {})}
        {...(actions
          ? {
              onDelete: actions.deleteTransaction,
              onToggleSelect: state.toggleSelected,
              onToggleDate: state.toggleDate,
            }
          : {})}
      />

      {state.selectMode && actions && (
        <BatchBar
          count={state.selected.size}
          busy={state.busy}
          onDelete={() => void state.deleteSelected()}
        />
      )}
    </div>
  )
}
