import { SegmentedControl } from '../../../components/SegmentedControl'
import type { HeroWindowKey, heroWindowsFor } from './heroWindow'

/** The hero's window buttons: how many years of the projection are drawn. */
export function HeroWindowPicker({
  windows,
  value,
  onChange,
}: {
  windows: ReturnType<typeof heroWindowsFor>
  value: HeroWindowKey
  onChange: (next: HeroWindowKey) => void
}) {
  if (windows.length < 2) return null
  return (
    <SegmentedControl
      options={windows.map((w) => ({ value: w.value, label: w.label }))}
      value={value}
      onChange={onChange}
      ariaLabel="Projection window"
      layout="compact"
    />
  )
}
