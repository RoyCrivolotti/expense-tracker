import { useRef } from 'react'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import styles from './DescriptionCombobox.module.css'

interface DescriptionSuggestionListProps {
  listId: string
  suggestions: DescriptionSuggestion[]
  highlight: number
  onPick: (suggestion: DescriptionSuggestion) => void
}

/** A press longer ago than this is not the one a click belongs to. */
const PRESS_MS = 1000

export function DescriptionSuggestionList({
  listId,
  suggestions,
  highlight,
  onPick,
}: DescriptionSuggestionListProps) {
  const pressed = useRef<{ label: string; at: number } | null>(null)
  const pick = (clicked: DescriptionSuggestion, at: number) => {
    const press = pressed.current
    pressed.current = null
    // Older matches can reorder the list between a finger going down and the click that follows it, and the click then
    // lands on whatever is at that spot: the row that was touched is the one meant.
    const touched = press && at - press.at < PRESS_MS ? suggestions.find((s) => s.label === press.label) : undefined
    onPick(touched ?? clicked)
  }
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
          onPointerDown={(e) => {
            pressed.current = { label: s.label, at: e.timeStamp }
          }}
          onClick={(e) => pick(s, e.timeStamp)}
        >
          {s.label}
        </li>
      ))}
    </ul>
  )
}
