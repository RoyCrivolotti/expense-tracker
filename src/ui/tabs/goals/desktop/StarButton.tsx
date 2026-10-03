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

/** The star on an input that sends it to the levers bar, or back. */
export function StarButton({ filled, label, disabled = false, title, onClick }: StarButtonProps) {
  return (
    <button
      type="button"
      className={filled ? `${styles.star} ${styles.starOn}` : styles.star}
      aria-label={label}
      {...(title ? { title } : {})}
      disabled={disabled}
      onClick={onClick}
    >
      <StarIcon {...(filled ? { fill: 'currentColor' } : {})} />
    </button>
  )
}
