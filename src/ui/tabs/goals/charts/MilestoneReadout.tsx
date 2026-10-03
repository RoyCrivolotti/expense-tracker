import styles from '../goals.module.css'

/**
 * The sentence for the cell or dot in hand, in a live region so that a screen reader says it as
 * it changes. Before there is one it says how to get one: `what` is the thing to point at and
 * `more` anything else worth knowing about moving between them.
 */
export function MilestoneReadout({
  text,
  touch,
  what,
  more = '',
}: {
  text: string | null
  touch: boolean
  what: string
  more?: string
}) {
  return (
    <p className={text ? styles.matrixReadout : `${styles.matrixReadout} ${styles.matrixReadoutEmpty}`} aria-live="polite">
      {text ?? `${touch ? 'Tap' : 'Point at or focus'} ${what} to read it as a sentence.${more}`}
    </p>
  )
}
