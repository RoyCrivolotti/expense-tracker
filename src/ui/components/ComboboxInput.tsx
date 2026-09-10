import type { RefObject } from 'react'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { handleComboboxKeyDown, scheduleBlurDismiss } from './descriptionComboboxUtils'
import styles from './DescriptionCombobox.module.css'

interface ComboboxInputProps {
  listId: string
  rootRef: RefObject<HTMLDivElement | null>
  value: string
  placeholder?: string
  open: boolean
  highlight: number
  suggestions: DescriptionSuggestion[]
  onChange: (value: string) => void
  onFocus: () => void
  onDismiss: () => void
  setHighlight: (value: number | ((h: number) => number)) => void
  setFocused: (value: boolean) => void
  onPick: (suggestion: DescriptionSuggestion) => void
  /** See `KeyHandlerOpts.onEnter` — "Enter submits" for quick-entry callers. */
  onEnter?: (() => void) | undefined
  /** Lets a caller drive focus imperatively (e.g. move here from a preceding field). */
  inputRef?: RefObject<HTMLInputElement | null> | undefined
  /** Names the input where there is no visible `<Field label>` wrapping it. */
  ariaLabel?: string | undefined
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send' | undefined
}

export function ComboboxInput({
  listId,
  rootRef,
  value,
  placeholder,
  open,
  highlight,
  suggestions,
  onChange,
  onFocus,
  onDismiss,
  setHighlight,
  setFocused,
  onPick,
  onEnter,
  inputRef,
  ariaLabel,
  enterKeyHint,
}: ComboboxInputProps) {
  return (
    <input
      ref={inputRef}
      className={styles.input}
      role="combobox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={highlight >= 0 ? `${listId}-opt-${highlight}` : undefined}
      aria-autocomplete="list"
      aria-label={ariaLabel}
      enterKeyHint={enterKeyHint}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        setHighlight(-1)
        onChange(e.target.value)
      }}
      onFocus={onFocus}
      onBlur={() => scheduleBlurDismiss(rootRef, onDismiss)}
      onKeyDown={(e) =>
        handleComboboxKeyDown(e, {
          open,
          suggestions,
          highlight,
          setHighlight,
          setFocused,
          accept: onPick,
          onEnter,
        })
      }
    />
  )
}
