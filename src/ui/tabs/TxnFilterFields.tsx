import type { Account, Category, Flag, Label, TxnType } from '../../types'
import { shownFlagOptions } from './flagFilterOptions'
import { FlagFilterSelect, LabelFilterField } from './TxnFilterPickers'
import type { StatusFilter } from './TxnFilters'
import styles from './tabs.module.css'

/**
 * Every filter field in the sheet as one grid, three to a row: Category, Account, Type,
 * then Status, Flag, Labels. Flag and Labels only exist once there is something to filter
 * by, so a user without them has four or five fields; four go two to a row rather than
 * leaving Status alone on a line, and five leave the last cell blank rather than
 * stretching two boxes wider than the rest.
 */
interface FilterFieldsProps {
  categories: Category[]
  accounts: Account[]
  flags?: Flag[]
  labels: Label[]
  categoryId: number | 'all'
  accountId: number | 'all'
  txnType: TxnType | 'all'
  status: StatusFilter
  flagId?: number | 'all' | 'none'
  labelIds: number[]
  selectMode: boolean
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onTxnType: (value: TxnType | 'all') => void
  onStatus: (value: StatusFilter) => void
  onFlag?: (value: number | 'all' | 'none') => void
  onLabelIds: (ids: number[]) => void
}

export function FilterFields(p: FilterFieldsProps) {
  const { flags, flagId, onFlag, labels, labelIds, selectMode, onLabelIds } = p
  const flagOptions = shownFlagOptions(flags, flagId, onFlag)
  const showLabels = labels.length > 0
  const fieldCount = 4 + Number(flagOptions !== null) + Number(showLabels)
  const columns = fieldCount === 4 ? 2 : 3

  return (
    <div className={styles.filterFields} data-columns={columns}>
      <FilterSelects {...p} />
      {flagOptions && flagId !== undefined && onFlag ? (
        <FlagFilterSelect options={flagOptions} flagId={flagId} selectMode={selectMode} onFlag={onFlag} />
      ) : null}
      {showLabels ? (
        <LabelFilterField labels={labels} labelIds={labelIds} selectMode={selectMode} onLabelIds={onLabelIds} />
      ) : null}
    </div>
  )
}

interface SelectsProps {
  categories: Category[]
  accounts: Account[]
  categoryId: number | 'all'
  accountId: number | 'all'
  txnType: TxnType | 'all'
  status: StatusFilter
  selectMode: boolean
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onTxnType: (value: TxnType | 'all') => void
  onStatus: (value: StatusFilter) => void
}

/** The Category, Account, Type and Status selects: the cells of the grid that are always there. */
/** The Category and Account selects. */
function CategoryAccountSelects({
  categories,
  accounts,
  categoryId,
  accountId,
  selectMode,
  onCategory,
  onAccount,
}: SelectsProps) {
  return (
    <>
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
    </>
  )
}

/** The Type and Status selects. */
function TypeStatusSelects({ txnType, status, selectMode, onTxnType, onStatus }: SelectsProps) {
  return (
    <>
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
    </>
  )
}

function FilterSelects(p: SelectsProps) {
  return (
    <>
      <CategoryAccountSelects {...p} />
      <TypeStatusSelects {...p} />
    </>
  )
}
