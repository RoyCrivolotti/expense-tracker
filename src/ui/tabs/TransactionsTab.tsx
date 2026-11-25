import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { StaleList } from '../StaleList'
import { matchAnnouncement } from './matchAnnouncement'
import { useTransactionsScrollPadding } from './useTransactionsScrollPadding'
import { useTransactionsTabState } from './useTransactionsTabState'
import type { TransactionsEntry } from './transactionsEntry'
import { useDebouncedAnnouncement } from '../hooks/useDebouncedAnnouncement'
import { useToast } from '../hooks/useToast'
import { FILTERS_LOCKED_HINT } from './selectionLockHints'
import { FiltersBar, ResultsList, TransactionsCards } from './TransactionsTabParts'
import { TabSheets } from './TransactionsTabSheets'
import { useTabOverlays } from './useTabOverlays'
import styles from './tabs.module.css'

interface TransactionsTabProps {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
  /** Told when row selection starts and ends, so the shell can hold the month still. */
  onSelectModeChange?: ((selecting: boolean) => void) | undefined
  /** How many times the user has moved the header month. */
  monthNavigation?: number | undefined
  /** A filter preset another tab handed over on the way in (see transactionsEntry). */
  entry?: TransactionsEntry | null | undefined
}

export function TransactionsTab({
  model,
  month,
  actions,
  onSelectModeChange,
  monthNavigation,
  entry,
}: TransactionsTabProps) {
  const state = useTransactionsTabState(model, month, actions, {
    onSelectModeChange,
    monthNavigation,
    entry,
  })
  useTransactionsScrollPadding(state.listRows.length > 0, state.selectMode)
  const overlays = useTabOverlays(model, actions)
  const announcement = useDebouncedAnnouncement(matchAnnouncement(state))
  const { showToast } = useToast()
  const explainFilterLock = () => showToast(FILTERS_LOCKED_HINT)

  return (
    <div className={`${styles.stack} ${styles.txnStack}`}>
      {actions && (
        <TransactionsCards {...{ model, month, actions, state, overlays }} onLockedFilterPress={explainFilterLock} />
      )}

      <FiltersBar model={model} state={state} onLockedPress={explainFilterLock} />

      {/*
        The announcement is a separate, debounced node rather than role=status on
        the visible summary: that fired on every keystroke in the search box, so
        a screen reader read a new total for each letter typed.
      */}
      <p className={styles.visuallyHidden} role="status">
        {announcement}
      </p>
      <StaleList stale={state.stale}>
        <ResultsList
          model={model}
          month={month}
          actions={actions}
          state={state}
          onEditStatement={overlays.setEditingStatement}
        />
      </StaleList>
      {state.footer}

      <TabSheets model={model} actions={actions} state={state} overlays={overlays} />
    </div>
  )
}
