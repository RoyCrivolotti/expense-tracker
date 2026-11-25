import type { Account, Category, Flag, Label, TxnType } from '../../types'
import { Modal } from '../components/Modal'
import { FilterFields } from './TxnFilterFields'
import { DateScopeRow, LockShield } from './TxnFilterRows'
import { AmountRangeRow } from './TxnAmountRange'
import type { StatusFilter } from './TxnFilters'
import type { TxnDateScope } from './txnDateScope'
import styles from './tabs.module.css'

interface TxnFiltersSheetProps {
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
  amountMin: string
  amountMax: string
  amountMinCents: number | null
  amountMaxCents: number | null
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
  onAmountMin: (value: string) => void
  onAmountMax: (value: string) => void
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
  onLockedPress?: (() => void) | undefined
}

/**
 * The filter fields and date scope in a sheet, so adjusting a filter does not push the
 * transaction list down by the ~170px they take up inline.
 */
export function TxnFiltersSheet(p: TxnFiltersSheetProps) {
  return (
    <Modal title="Filters" onClose={p.onClose}>
      <div className={styles.filterSecondary}>
        <FilterFields {...p} />
        <AmountRangeRow {...p} />
        <DateScopeRow {...p} />
        {/* Unreachable in practice — selectMode can only start from the Select button
            in SearchRow, which the sheet's own focus trap makes unreachable while this
            is open — but kept so a locked field still explains itself if that ever
            changes, exactly as it did inline. */}
        {p.selectMode ? (
          <LockShield label="Filters are locked while rows are selected" onPress={p.onLockedPress} />
        ) : null}
      </div>
    </Modal>
  )
}
