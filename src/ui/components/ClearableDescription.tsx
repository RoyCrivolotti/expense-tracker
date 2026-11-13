import { useRef } from 'react'
import type { DescriptionIndex, DescriptionSuggestion } from '../../data/descriptionIndex'
import type { TransactionSeed } from '../actions'
import { CloseIcon } from '../icons'
import styles from './ClearableDescription.module.css'
import { DescriptionCombobox } from './DescriptionCombobox'

interface Props {
  seed: TransactionSeed | undefined
  value: string
  index: DescriptionIndex
  onChange: (value: string) => void
  onAccept: (suggestion: DescriptionSuggestion) => void
}

/**
 * The description field of a new transaction. For a captured payment whose description was filled in for the person,
 * and while there is text, a button at the end empties it in one tap and leaves the cursor in the field, so they can
 * type their own. A press does not take focus from the field, which keeps the keyboard up on a phone.
 */
export function ClearableDescription({ seed, value, index, onChange, onAccept }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const prefilled = Boolean(seed?.recommendationId && seed.description)
  return (
    <div className={styles.wrap} ref={wrap}>
      <DescriptionCombobox value={value} index={index} placeholder="e.g. Mercadona" onChange={onChange} onAccept={onAccept} />
      {prefilled && value !== '' ? (
        <button
          type="button"
          className={styles.clear}
          aria-label="Clear description"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('')
            wrap.current?.querySelector('input')?.focus()
          }}
        >
          <CloseIcon width={16} height={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
