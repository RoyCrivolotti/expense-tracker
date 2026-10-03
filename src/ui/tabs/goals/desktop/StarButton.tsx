import { StarIcon } from '../../../icons'
import styles from './planDesktop.module.css'

interface StarButtonProps {
  /** In the bar: solid, and pressing it takes the input out. Outlined, pressing it puts the input in. */
  filled: boolean
  label: string
  disabled?: boolean
  /** Why it cannot be pressed, for a pointer to find out. */
  title?: string
  onClick: () => void
}

/**
 * The star on an input that sends it to the levers bar, or back. Its tooltip is what pressing it
 * does, the same as its name, unless it is held back, when it says why: nothing else on the page
 * says what a star is until the inputs panel is open.
 */
export function StarButton({ filled, label, disabled = false, title, onClick }: StarButtonProps) {
  return (
    <button
      type="button"
      className={filled ? `${styles.star} ${styles.starOn}` : styles.star}
      aria-label={label}
      data-star=""
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      <StarIcon {...(filled ? { fill: 'currentColor' } : {})} />
    </button>
  )
}
