import type { DescriptionIndex } from '../../data/descriptionIndex'
import { DescriptionCombobox } from '../components/DescriptionCombobox'
import { replacedSummary, type DescriptionCount } from './bulkEditFields'
import styles from './BulkEditSheet.module.css'

interface DescriptionFieldProps {
  value: string
  index: DescriptionIndex
  /** What the chosen rows are called now. Absent or empty when there is nothing to say. */
  replaced: readonly DescriptionCount[] | undefined
  onChange: (value: string) => void
}

/**
 * Its own component so the sheet keeps its branches: the sheet sits on the complexity
 * ceiling of 12. Picking a suggestion sets the text only. The transaction form copies a
 * suggestion's category and account too, but a rename must not touch either, since the
 * rows being renamed can each have their own.
 */
export function DescriptionField({ value, index, replaced, onChange }: DescriptionFieldProps) {
  return (
    <>
      <DescriptionCombobox
        value={value}
        index={index}
        placeholder="e.g. Netflix"
        onChange={onChange}
        onAccept={(suggestion) => onChange(suggestion.label)}
      />
      {replaced && replaced.length > 0 && <p className={styles.fieldHint}>{replacedSummary(replaced)}</p>}
      <p className={styles.fieldHint}>
        Transactions that share a description count as one recurring pattern in Analytics.
      </p>
    </>
  )
}
