import type { Account, Category, TxnType } from '../../types'
import type { StatusFilter } from './TxnFilters'

export interface ActiveFilterChip {
  key: string
  label: string
  onClear: () => void
}

interface ChipInput {
  categories: Category[]
  accounts: Account[]
  categoryId: number | 'all'
  accountId: number | 'all'
  txnType: TxnType | 'all'
  status: StatusFilter
  useDateRange: boolean
  dateFrom: string
  dateTo: string
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onTxnType: (value: TxnType | 'all') => void
  onStatus: (value: StatusFilter) => void
  onUseDateRange: (value: boolean) => void
  onDateFrom: (value: string) => void
  onDateTo: (value: string) => void
}

export function buildActiveFilterChips(input: ChipInput): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
  if (input.categoryId !== 'all') {
    const name = input.categories.find((c) => c.id === input.categoryId)?.name ?? 'Category'
    chips.push({
      key: 'category',
      label: `Category: ${name}`,
      onClear: () => input.onCategory('all'),
    })
  }
  if (input.accountId !== 'all') {
    const name = input.accounts.find((a) => a.id === input.accountId)?.name ?? 'Account'
    chips.push({
      key: 'account',
      label: `Account: ${name}`,
      onClear: () => input.onAccount('all'),
    })
  }
  if (input.txnType !== 'all') {
    chips.push({
      key: 'type',
      label: `Type: ${input.txnType}`,
      onClear: () => input.onTxnType('all'),
    })
  }
  if (input.status !== 'all') {
    chips.push({
      key: 'status',
      label: `Status: ${input.status}`,
      onClear: () => input.onStatus('all'),
    })
  }
  if (input.useDateRange) {
    const from = input.dateFrom || '…'
    const to = input.dateTo || '…'
    chips.push({
      key: 'date',
      label: `Dates: ${from} – ${to}`,
      onClear: () => {
        input.onUseDateRange(false)
        input.onDateFrom('')
        input.onDateTo('')
      },
    })
  }
  return chips
}
