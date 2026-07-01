import type { Account, Category, TxnType } from '../../types'
import type { StatusFilter } from './TxnFilters'
import { isSecondaryDateScope, scopeChipLabel, type TxnDateScope } from './txnDateScope'

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
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onTxnType: (value: TxnType | 'all') => void
  onStatus: (value: StatusFilter) => void
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
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
  if (isSecondaryDateScope(input.dateScope)) {
    const label = scopeChipLabel(input.dateScope, input.customDateFrom, input.customDateTo)
    if (label) {
      chips.push({
        key: 'date',
        label,
        onClear: () => {
          input.onDateScope('budgetMonth')
          input.onCustomDateFrom('')
          input.onCustomDateTo('')
        },
      })
    }
  }
  return chips
}
