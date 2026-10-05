import type { SpendingGroupBy } from '../../../engine'
import { SegmentedControl } from '../../components/SegmentedControl'

const ALL_OPTIONS: { value: SpendingGroupBy; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'fixedFlexible', label: 'Fixed / flexible' },
  { value: 'label', label: 'Label' },
  { value: 'merchant', label: 'Merchant' },
]

/** Group by category, fixed vs flexible, label (hidden without labels) or merchant. */
export function GroupByControl({
  value,
  onChange,
  hasLabels,
}: {
  value: SpendingGroupBy
  onChange: (next: SpendingGroupBy) => void
  hasLabels: boolean
}) {
  const options = hasLabels ? ALL_OPTIONS : ALL_OPTIONS.filter((o) => o.value !== 'label')
  return (
    <SegmentedControl
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel="Group spending by"
      layout="scroll"
    />
  )
}
