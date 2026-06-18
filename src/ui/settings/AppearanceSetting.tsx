import type { ExpenseTheme } from '../hooks/useExpenseTheme'
import { SectionTitle } from '../components/primitives'
import { SegmentedControl } from '../components/SegmentedControl'

const OPTIONS: { value: ExpenseTheme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function AppearanceSetting({
  theme,
  onChange,
}: {
  theme: ExpenseTheme
  onChange: (next: ExpenseTheme) => void
}) {
  return (
    <>
      <SectionTitle>Appearance</SectionTitle>
      <SegmentedControl
        options={OPTIONS}
        value={theme}
        onChange={onChange}
        ariaLabel="Colour theme"
      />
    </>
  )
}
