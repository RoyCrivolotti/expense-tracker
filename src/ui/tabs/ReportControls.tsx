import type { ExpenseReport } from '../../domain/engine/expenseReport'
import { SegmentedControl } from '../components/SegmentedControl'
import styles from './ExpenseReportView.module.css'

const RECEIPT_FILTER_OPTIONS: { value: 'all' | 'receipted'; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'receipted', label: 'With receipt' },
]

const NOTES_OPTIONS: { value: 'shown' | 'hidden'; label: string }[] = [
  { value: 'shown', label: 'Show notes' },
  { value: 'hidden', label: 'Hide notes' },
]

/**
 * The pills above the sheet: which items, and whether their notes go out.
 *
 * Its own component so the view keeps its branch count. Each pill is hidden
 * entirely rather than disabled when it has nothing to do: the receipt filter
 * when every line has a receipt (the count is already shown in the sheet itself),
 * and the notes pill when no line has a note.
 */
export function ReportControls({
  report,
  receiptsOnly,
  onReceiptsOnlyChange,
  showNotes,
  onShowNotesChange,
}: {
  /** The full claim, not the filtered one: the pills must not vanish under their own filter. */
  report: ExpenseReport
  receiptsOnly: boolean
  onReceiptsOnlyChange: (receiptsOnly: boolean) => void
  showNotes: boolean
  onShowNotesChange: (showNotes: boolean) => void
}) {
  const hasMissingReceipts = report.missingReceipts.length > 0
  const hasNotes = [...report.lines, ...report.credits].some((l) => l.transaction.notes)
  if (!hasMissingReceipts && !hasNotes) return null
  return (
    <div className={styles.reportControls}>
      {hasNotes ? (
        <SegmentedControl
          options={NOTES_OPTIONS}
          value={showNotes ? 'shown' : 'hidden'}
          onChange={(value) => onShowNotesChange(value === 'shown')}
          ariaLabel="Show or hide the notes on each item"
        />
      ) : null}
      {hasMissingReceipts ? (
        <SegmentedControl
          options={RECEIPT_FILTER_OPTIONS}
          value={receiptsOnly ? 'receipted' : 'all'}
          onChange={(value) => onReceiptsOnlyChange(value === 'receipted')}
          ariaLabel="Filter the report by receipt"
        />
      ) : null}
    </div>
  )
}
