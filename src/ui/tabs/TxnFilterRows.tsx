import { useRef, useState } from 'react'
import type { Account, Category, Flag, Label, TxnType } from '../../types'
import { ChevronIcon, CloseIcon } from '../icons'
import { DateInput } from '../components/DateInput'
import { LabelPickerPopover } from '../components/LabelPickerPopover'
import { Presence } from '../components/Presence'
import { SegmentedControl } from '../components/SegmentedControl'
import { EXIT_MS } from '../hooks/motion'
import { useToggleIds } from '../hooks/useToggleIds'
import type { StatusFilter } from './TxnFilters'
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
export function LockShield({
  label,
  onPress,
}: {
  label: string
  onPress?: (() => void) | undefined
}) {
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
          placeholder="Search description or notes…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          disabled={selectMode}
        />
        {query && !selectMode && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => onQuery('')}
            aria-label="Clear search"
          >
            <CloseIcon />
          </button>
        )}
        {selectMode ? (
          <LockShield label="Search is locked while rows are selected" onPress={onLockedPress} />
        ) : null}
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

export function FilterToggleRow({
  expanded,
  onToggle,
  secondaryFilterCount,
  hasActiveFilters,
  selectMode,
  onClearFilters,
  onLockedPress,
}: {
  expanded: boolean
  onToggle: () => void
  secondaryFilterCount: number
  hasActiveFilters: boolean
  selectMode: boolean
  onClearFilters: () => void
  onLockedPress?: (() => void) | undefined
}) {
  const active = secondaryFilterCount > 0
  return (
    <div className={styles.filterToggleRow}>
      <button
        type="button"
        className={`${styles.filterToggle}${active ? ` ${styles.filterToggleActive}` : ''}`}
        onClick={selectMode ? onLockedPress : onToggle}
        {...(selectMode ? { 'aria-disabled': true } : {})}
        aria-expanded={expanded}
      >
        <span>{expanded ? '▾' : '▸'} Filters</span>
        {active ? (
          <span className={styles.filterToggleBadge} aria-label={`${secondaryFilterCount} active filters`}>
            {secondaryFilterCount}
          </span>
        ) : null}
      </button>
      {hasActiveFilters && !selectMode ? (
        <button type="button" className={styles.filterClear} onClick={onClearFilters}>
          Clear filters
        </button>
      ) : null}
    </div>
  )
}

/**
 * Category, Type, Account, in that order — a fixed three-column row so it lines
 * up exactly with SecondaryFilterRow below it (see .filterRow), rather than the
 * two dimensions it used to hold stretching to fill the row on their own.
 */
export function PrimaryFilterRow({
  categories,
  accounts,
  categoryId,
  accountId,
  txnType,
  selectMode,
  onCategory,
  onAccount,
  onTxnType,
}: {
  categories: Category[]
  accounts: Account[]
  categoryId: number | 'all'
  accountId: number | 'all'
  txnType: TxnType | 'all'
  selectMode: boolean
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onTxnType: (value: TxnType | 'all') => void
}) {
  return (
    <div className={styles.filterRow}>
      <select
        className={categoryId !== 'all' ? styles.activeSelect : undefined}
        value={categoryId}
        onChange={(e) => onCategory(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        disabled={selectMode}
        aria-label="Filter by category"
      >
        <option value="all">Category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className={txnType !== 'all' ? styles.activeSelect : undefined}
        value={txnType}
        onChange={(e) => onTxnType(e.target.value as TxnType | 'all')}
        disabled={selectMode}
        aria-label="Filter by type"
      >
        <option value="all">Type</option>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
        <option value="investment">Investment</option>
        <option value="refund">Refund</option>
      </select>
      <select
        className={accountId !== 'all' ? styles.activeSelect : undefined}
        value={accountId}
        onChange={(e) => onAccount(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        disabled={selectMode}
        aria-label="Filter by account"
      >
        <option value="all">Account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function labelTriggerText(value: number[], labels: Label[]): string {
  if (value.length === 0) return 'Labels'
  if (value.length === 1) return labels.find((l) => l.id === value[0])?.name ?? '1 label'
  return `Labels (${value.length})`
}

/**
 * Status, Flag, Label, in that order — the second fixed three-column row, lined
 * up with PrimaryFilterRow above it via the shared .filterRow grid. Flag and
 * Label both disappear when there is nothing to filter by (no flags, no
 * labels), so this row can hold anywhere from one to three columns; the grid
 * leaves the rest blank rather than stretching what is left to fill the row,
 * which is what keeps both rows aligned regardless of how many show up.
 *
 * The label picker reuses LabelPickerPopover — the same multi-select the edit
 * sheet uses (see LabelField) — rather than a second multi-select widget, since
 * a label filter can match more than one label at once (OR), which a native
 * select can't express.
 */
export function SecondaryFilterRow({
  flags,
  flagId,
  onFlag,
  status,
  onStatus,
  labels,
  labelIds,
  onLabelIds,
  selectMode,
}: {
  flags?: Flag[]
  flagId?: number | 'all' | 'none'
  onFlag?: (value: number | 'all' | 'none') => void
  status: StatusFilter
  onStatus: (value: StatusFilter) => void
  labels: Label[]
  labelIds: number[]
  onLabelIds: (ids: number[]) => void
  selectMode: boolean
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const toggle = useToggleIds(labelIds, onLabelIds)
  const flagOptions = flags?.filter((f) => f.active || f.id === flagId)

  return (
    <div className={styles.filterRow}>
      <select
        className={status !== 'all' ? styles.activeSelect : undefined}
        value={status}
        onChange={(e) => onStatus(e.target.value as StatusFilter)}
        disabled={selectMode}
        aria-label="Filter by status"
      >
        <option value="all">Status</option>
        <option value="posted">Posted</option>
        <option value="forecast">Forecast</option>
        <option value="cancelled">Cancelled</option>
      </select>
      {flagOptions && flagOptions.length > 0 && flagId !== undefined && onFlag ? (
        <select
          className={flagId !== 'all' ? styles.activeSelect : undefined}
          value={flagId}
          onChange={(e) => {
            const raw = e.target.value
            onFlag(raw === 'all' || raw === 'none' ? raw : Number(raw))
          }}
          disabled={selectMode}
          aria-label="Filter by flag"
        >
          <option value="all">Flag</option>
          <option value="none">Unflagged</option>
          {flagOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.active ? '' : ' (archived)'}
            </option>
          ))}
        </select>
      ) : null}
      {labels.length > 0 ? (
        <>
          <button
            type="button"
            ref={triggerRef}
            className={labelIds.length > 0 ? `${styles.labelTrigger} ${styles.labelTriggerActive}` : styles.labelTrigger}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={selectMode}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={styles.labelTriggerText}>{labelTriggerText(labelIds, labels)}</span>
            <ChevronIcon className={styles.labelTriggerChevron} aria-hidden="true" />
          </button>
          <Presence show={open} exitMs={EXIT_MS.popover}>
            <LabelPickerPopover
              value={labelIds}
              labels={labels}
              triggerRef={triggerRef}
              onToggle={toggle}
              onClose={() => setOpen(false)}
            />
          </Presence>
        </>
      ) : null}
    </div>
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
      <span className={styles.dateScopeLabel} id="txn-date-scope-label">
        Date scope
      </span>
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
          <DateInput
            value={customDateFrom}
            onChange={onCustomDateFrom}
            disabled={selectMode}
            ariaLabel="From date"
          />
          <DateInput
            value={customDateTo}
            onChange={onCustomDateTo}
            disabled={selectMode}
            ariaLabel="To date"
          />
        </div>
      ) : null}
    </div>
  )
}
