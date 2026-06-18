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
  const [highlight, setHighlight] = useState(-1)
  const suggestions = useMemo(() => (value.trim() ? index.search(value) : []), [value, index])
  const open = focused && suggestions.length > 0
  const dismiss = () => {
    setFocused(false)
    setHighlight(-1)
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
