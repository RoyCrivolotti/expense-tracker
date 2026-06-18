import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import styles from './DescriptionCombobox.module.css'

interface DescriptionSuggestionListProps {
  listId: string
  suggestions: DescriptionSuggestion[]
  highlight: number
  onPick: (suggestion: DescriptionSuggestion) => void
}

export function DescriptionSuggestionList({
  listId,
  suggestions,
  highlight,
  onPick,
}: DescriptionSuggestionListProps) {
  return (
    <ul id={listId} className={styles.list} role="listbox">
      {suggestions.map((s, i) => (
        <li
          key={s.label}
          id={`${listId}-opt-${i}`}
          role="option"
          aria-selected={i === highlight}
          className={i === highlight ? `${styles.option} ${styles.optionActive}` : styles.option}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s)}
        >
          {s.label}
        </li>
      ))}
    </ul>
  )
}
