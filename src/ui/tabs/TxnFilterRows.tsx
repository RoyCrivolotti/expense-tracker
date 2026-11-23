import { CloseIcon, FilterIcon } from '../icons'
import { DateInput } from '../components/DateInput'
import { SegmentedControl } from '../components/SegmentedControl'
import type { TxnDateScope } from './txnDateScope'
import styles from './tabs.module.css'

const DATE_SCOPE_OPTIONS: { value: TxnDateScope; label: string }[] = [
  { value: 'budgetMonth', label: 'Month' },
  { value: 'last3Months', label: '3 months' },
  { value: 'allDates', label: 'All' },
  { value: 'custom', label: 'Custom' },
]

/**
 * Laid over a field that is locked while rows are selected, so a tap says why: a disabled
 * input or select never receives the click. A real button, so it is labelled and reachable.
 */
export function LockShield({ label, onPress }: { label: string; onPress?: (() => void) | undefined }) {
  return <button type="button" className={styles.lockShield} onClick={onPress} aria-label={label} />
}

export function SearchRow({
  query,
  selectMode,
  selectBusy = false,
  canSelect,
  onQuery,
  onToggleSelectMode,
  onLockedPress,
}: {
  query: string
  selectMode: boolean
  /** A bulk action is running, and leaving select mode would not stop it. */
  selectBusy?: boolean
  canSelect: boolean
  onQuery: (value: string) => void
  onToggleSelectMode: () => void
  /** Pressing the locked search box: say why nothing happens. */
  onLockedPress?: (() => void) | undefined
}) {
  return (
    <div className={styles.filterTop}>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          type="text"
          inputMode="search"
          placeholder="Search description, notes or amount…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          disabled={selectMode}
        />
        {query && !selectMode && (
          <button type="button" className={styles.searchClear} onClick={() => onQuery('')} aria-label="Clear search">
            <CloseIcon />
          </button>
        )}
        {selectMode ? <LockShield label="Search is locked while rows are selected" onPress={onLockedPress} /> : null}
      </div>
      {/* A selection already under way can always be cancelled, even once the app has
          gone read-only and could not start a new one. */}
      {canSelect || selectMode ? (
        <button
          type="button"
          className={styles.selectBtn}
          onClick={onToggleSelectMode}
          disabled={selectMode && selectBusy}
        >
          {selectMode ? 'Cancel' : 'Select'}
        </button>
      ) : null}
    </div>
  )
}

export function FilterToggle({
  expanded,
  onToggle,
  secondaryFilterCount,
  selectMode,
  onLockedPress,
}: {
  expanded: boolean
  onToggle: () => void
  secondaryFilterCount: number
  selectMode: boolean
  onLockedPress?: (() => void) | undefined
}) {
  const active = secondaryFilterCount > 0
  return (
    <button
      type="button"
      className={`${styles.filterToggle}${active ? ` ${styles.filterToggleActive}` : ''}`}
      onClick={selectMode ? onLockedPress : onToggle}
      {...(selectMode ? { 'aria-disabled': true } : {})}
      aria-expanded={expanded}
    >
      <FilterIcon className={styles.filterToggleIcon} aria-hidden="true" />
      <span>Filters</span>
      {active ? (
        <span className={styles.filterToggleBadge} aria-label={`${secondaryFilterCount} active filters`}>
          {secondaryFilterCount}
        </span>
      ) : null}
    </button>
  )
}

export function DateScopeRow({
  dateScope,
  customDateFrom,
  customDateTo,
  selectMode,
  onDateScope,
  onCustomDateFrom,
  onCustomDateTo,
}: {
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  selectMode: boolean
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
}) {
  return (
    <div className={styles.dateScopeBlock}>
      <SegmentedControl
        options={DATE_SCOPE_OPTIONS}
        value={dateScope}
        onChange={onDateScope}
        ariaLabel="Date scope"
        layout="bar"
        disabled={selectMode}
      />
      {dateScope === 'custom' ? (
        <div className={styles.selectRow}>
          <DateInput value={customDateFrom} onChange={onCustomDateFrom} disabled={selectMode} ariaLabel="From date" />
          <DateInput value={customDateTo} onChange={onCustomDateTo} disabled={selectMode} ariaLabel="To date" />
        </div>
      ) : null}
    </div>
  )
}
