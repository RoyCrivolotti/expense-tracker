import type { Account, Category, TxnStatus, TxnType } from '../../types'
import styles from './tabs.module.css'
import {
  CategoryAccountRow,
  DateRangeRow,
  SearchRow,
  StatusTypeRow,
} from './TxnFilterRows'

export type StatusFilter = TxnStatus | 'all'

export interface TxnFiltersProps {
  categories: Category[]
  accounts: Account[]
  query: string
  status: StatusFilter
  categoryId: number | 'all'
  accountId: number | 'all'
  txnType: TxnType | 'all'
  useDateRange: boolean
  dateFrom: string
  dateTo: string
  selectMode: boolean
  canSelect: boolean
  onQuery: (value: string) => void
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onStatus: (value: StatusFilter) => void
  onTxnType: (value: TxnType | 'all') => void
  onUseDateRange: (value: boolean) => void
  onDateFrom: (value: string) => void
  onDateTo: (value: string) => void
  onToggleSelectMode: () => void
}

export function TxnFilters(props: TxnFiltersProps) {
  return (
    <div className={styles.filters}>
      <SearchRow
        query={props.query}
        selectMode={props.selectMode}
        canSelect={props.canSelect}
        onQuery={props.onQuery}
        onToggleSelectMode={props.onToggleSelectMode}
      />
      <CategoryAccountRow
        categories={props.categories}
        accounts={props.accounts}
        categoryId={props.categoryId}
        accountId={props.accountId}
        selectMode={props.selectMode}
        onCategory={props.onCategory}
        onAccount={props.onAccount}
      />
      <StatusTypeRow
        status={props.status}
        txnType={props.txnType}
        selectMode={props.selectMode}
        onStatus={props.onStatus}
        onTxnType={props.onTxnType}
      />
      <DateRangeRow
        useDateRange={props.useDateRange}
        dateFrom={props.dateFrom}
        dateTo={props.dateTo}
        selectMode={props.selectMode}
        onUseDateRange={props.onUseDateRange}
        onDateFrom={props.onDateFrom}
        onDateTo={props.onDateTo}
      />
    </div>
  )
}
