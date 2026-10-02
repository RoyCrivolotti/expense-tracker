import type { Account, Category, Flag, Label, TxnType } from '../../types'
import { Modal } from '../components/Modal'
import { DateScopeRow, FilterFields, LockShield } from './TxnFilterRows'
import type { StatusFilter } from './TxnFilters'
import type { TxnDateScope } from './txnDateScope'
import styles from './tabs.module.css'

/**
 * The filter fields and date scope in a sheet, so adjusting a filter does not push the
 * transaction list down by the ~170px they take up inline.
 */
export function TxnFiltersSheet({
  categories,
  accounts,
  flags,
  labels,
  status,
  categoryId,
  accountId,
  flagId,
  labelIds,
  txnType,
  dateScope,
  customDateFrom,
  customDateTo,
  selectMode,
  onClose,
  onCategory,
  onAccount,
  onFlag,
  onLabelIds,
  onStatus,
  onTxnType,
  onDateScope,
  onCustomDateFrom,
  onCustomDateTo,
  onLockedPress,
}: {
  categories: Category[]
  accounts: Account[]
  flags: Flag[]
  labels: Label[]
  status: StatusFilter
  categoryId: number | 'all'
  accountId: number | 'all'
  flagId: number | 'all' | 'none'
  labelIds: number[]
  txnType: TxnType | 'all'
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  selectMode: boolean
  onClose: () => void
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onFlag: (value: number | 'all' | 'none') => void
  onLabelIds: (ids: number[]) => void
  onStatus: (value: StatusFilter) => void
  onTxnType: (value: TxnType | 'all') => void
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
  onLockedPress?: (() => void) | undefined
}) {
  return (
    <Modal title="Filters" onClose={onClose}>
      <div className={styles.filterSecondary}>
        <FilterFields
          categories={categories}
          accounts={accounts}
          flags={flags}
          labels={labels}
          categoryId={categoryId}
          accountId={accountId}
          txnType={txnType}
          status={status}
          flagId={flagId}
          labelIds={labelIds}
          selectMode={selectMode}
          onCategory={onCategory}
          onAccount={onAccount}
          onTxnType={onTxnType}
          onStatus={onStatus}
          onFlag={onFlag}
          onLabelIds={onLabelIds}
        />
        <DateScopeRow
          dateScope={dateScope}
          customDateFrom={customDateFrom}
          customDateTo={customDateTo}
          selectMode={selectMode}
          onDateScope={onDateScope}
          onCustomDateFrom={onCustomDateFrom}
          onCustomDateTo={onCustomDateTo}
        />
        {/* Unreachable in practice — selectMode can only start from the Select button
            in SearchRow, which the sheet's own focus trap makes unreachable while this
            is open — but kept so a locked field still explains itself if that ever
            changes, exactly as it did inline. */}
        {selectMode ? (
          <LockShield label="Filters are locked while rows are selected" onPress={onLockedPress} />
        ) : null}
      </div>
    </Modal>
  )
}
