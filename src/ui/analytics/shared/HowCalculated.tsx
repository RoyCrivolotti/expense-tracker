import styles from './shared.module.css'

/** A closed-by-default note inside a card: the rules behind its numbers. */
export function HowCalculated({ notes }: { notes: string[] }) {
  return (
    <details className={styles.how}>
      <summary className={styles.howSummary}>How is this calculated?</summary>
      <div className={styles.howBody}>
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </details>
  )
}
