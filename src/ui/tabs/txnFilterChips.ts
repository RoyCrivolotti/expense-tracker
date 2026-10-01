import type { Account, Category, Flag, Label, TxnType } from '../../types'
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
  flags: Flag[]
  labels: Label[]
  categoryId: number | 'all'
  accountId: number | 'all'
  flagId: number | 'all' | 'none'
  labelIds: number[]
  txnType: TxnType | 'all'
  status: StatusFilter
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onFlag: (value: number | 'all' | 'none') => void
  onLabelIds: (ids: number[]) => void
  onTxnType: (value: TxnType | 'all') => void
  onStatus: (value: StatusFilter) => void
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
}

/**
 * One builder per filter dimension, rather than one long if-chain: each stays
 * trivially readable, and adding a dimension is a new entry instead of another
 * branch in a function that was already at the complexity ceiling.
 */
type ChipBuilder = (input: ChipInput) => ActiveFilterChip | null

const categoryChip: ChipBuilder = (input) => {
  if (input.categoryId === 'all') return null
  const name = input.categories.find((c) => c.id === input.categoryId)?.name ?? 'Category'
  return { key: 'category', label: `Category: ${name}`, onClear: () => input.onCategory('all') }
}

const accountChip: ChipBuilder = (input) => {
  if (input.accountId === 'all') return null
  const name = input.accounts.find((a) => a.id === input.accountId)?.name ?? 'Account'
  return { key: 'account', label: `Account: ${name}`, onClear: () => input.onAccount('all') }
}

const flagChip: ChipBuilder = (input) => {
  if (input.flagId === 'all') return null
  if (input.flagId === 'none') {
    return { key: 'flag', label: 'Unflagged', onClear: () => input.onFlag('all') }
  }
  const name = input.flags.find((f) => f.id === input.flagId)?.name ?? 'Flag'
  return { key: 'flag', label: `Flag: ${name}`, onClear: () => input.onFlag('all') }
}

/** Names for up to two selected labels fit in a chip; beyond that a count reads
 *  better than a long comma-separated list crowding the row. */
const labelsChip: ChipBuilder = (input) => {
  if (input.labelIds.length === 0) return null
  if (input.labelIds.length > 2) {
    return { key: 'labels', label: `Labels (${input.labelIds.length})`, onClear: () => input.onLabelIds([]) }
  }
  const names = input.labelIds.map((id) => input.labels.find((l) => l.id === id)?.name ?? 'Label')
  const label = names.length === 1 ? `Label: ${names[0]}` : `Labels: ${names.join(', ')}`
  return { key: 'labels', label, onClear: () => input.onLabelIds([]) }
}

const typeChip: ChipBuilder = (input) =>
  input.txnType === 'all'
    ? null
    : { key: 'type', label: `Type: ${input.txnType}`, onClear: () => input.onTxnType('all') }

const statusChip: ChipBuilder = (input) =>
  input.status === 'all'
    ? null
    : { key: 'status', label: `Status: ${input.status}`, onClear: () => input.onStatus('all') }

const dateChip: ChipBuilder = (input) => {
  if (!isSecondaryDateScope(input.dateScope)) return null
  const label = scopeChipLabel(input.dateScope, input.customDateFrom, input.customDateTo)
  if (!label) return null
  return {
    key: 'date',
    label,
    onClear: () => {
      input.onDateScope('budgetMonth')
      input.onCustomDateFrom('')
      input.onCustomDateTo('')
    },
  }
}

const BUILDERS: ChipBuilder[] = [
  categoryChip,
  accountChip,
  flagChip,
  labelsChip,
  typeChip,
  statusChip,
  dateChip,
]

export function buildActiveFilterChips(input: ChipInput): ActiveFilterChip[] {
  return BUILDERS.map((build) => build(input)).filter((chip): chip is ActiveFilterChip => chip !== null)
}
