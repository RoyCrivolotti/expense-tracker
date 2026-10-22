import { useId, useMemo, useRef, useState } from 'react'
import type { DescriptionIndex, DescriptionSuggestion } from '../../data/descriptionIndex'
import { ComboboxInput } from './ComboboxInput'
import styles from './DescriptionCombobox.module.css'
import { DescriptionSuggestionList } from './DescriptionSuggestionList'

interface DescriptionComboboxProps {
  value: string
  index: DescriptionIndex
  placeholder?: string
  onChange: (value: string) => void
  onAccept: (suggestion: DescriptionSuggestion) => void
}

/** What an index that holds every row suggests: its own matches. */
function useOwnSuggestions(index: DescriptionIndex, value: string): DescriptionSuggestion[] {
  return useMemo(() => (value.trim() ? index.search(value) : []), [value, index])
}

export function DescriptionCombobox({
  value,
  index,
  placeholder,
  onChange,
  onAccept,
}: DescriptionComboboxProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  // The suggestion that is highlighted, not its place in the list: older matches can arrive and move it, and Enter has to
  // accept the one the user chose.
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const useSuggestions = index.useSuggestions ?? useOwnSuggestions
  const suggestions = useSuggestions(index, value)
  const highlight = suggestions.findIndex((s) => s.label === highlighted)
  const setHighlight = (next: number | ((h: number) => number)) => {
    const at = typeof next === 'function' ? next(highlight) : next
    setHighlighted(suggestions[at]?.label ?? null)
  }
  const open = focused && suggestions.length > 0
  const dismiss = () => {
    setFocused(false)
    setHighlighted(null)
  }
  const pick = (suggestion: DescriptionSuggestion) => {
    onAccept(suggestion)
    dismiss()
  }

  return (
    <div className={styles.combobox} ref={rootRef}>
      <ComboboxInput
        listId={listId}
        rootRef={rootRef}
        value={value}
        {...(placeholder !== undefined ? { placeholder } : {})}
        open={open}
        highlight={highlight}
        suggestions={suggestions}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onDismiss={dismiss}
        setHighlight={setHighlight}
        setFocused={setFocused}
        onPick={pick}
      />
      {open && (
        <DescriptionSuggestionList
          listId={listId}
          suggestions={suggestions}
          highlight={highlight}
          onPick={pick}
        />
      )}
    </div>
  )
}
