import { DateInput } from '../components/DateInput'
import { MonthInput } from '../components/MonthInput'

interface PickerProps {
  value: string
  onChange: (value: string) => void
  onTrapPausedChange: (paused: boolean) => void
}

/**
 * The sheet's date and budget month fields are the transaction form's own pickers, not
 * bare native inputs: iOS Safari sizes a native date or month input to its long-form
 * text, which ran past the field's card (NativeDateOverlay says more). Their names are
 * not the toggles' ("Date", "Budget month") so that each field has one of its own.
 */
export function BulkDateField(props: PickerProps) {
  return <DateInput ariaLabel="New date" {...props} />
}

export function BulkMonthField(props: PickerProps) {
  return <MonthInput ariaLabel="New budget month" {...props} />
}
