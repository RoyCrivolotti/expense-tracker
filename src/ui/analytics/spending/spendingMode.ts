import type { SpendingSort } from '../../../engine'

export type SpendingMode = 'list' | 'grid'

export const MODE_OPTIONS: { value: SpendingMode; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
]

export const SORT_OPTIONS: { value: SpendingSort; label: string }[] = [
  { value: 'amount', label: 'By amount' },
  { value: 'items', label: 'By items' },
]
