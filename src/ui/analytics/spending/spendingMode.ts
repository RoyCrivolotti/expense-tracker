export type SpendingMode = 'list' | 'grid'

export const MODE_OPTIONS: { value: SpendingMode; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
]
