import type { UsageView } from './recordUsage'
import styles from './definitions.module.css'

const WORDS = {
  reading: 'Reading the counts…',
  stale: 'The counts may be out of date.',
  failed: "Couldn't read the counts.",
} as const

/** Says why the counts beside it cannot be taken as they are, and offers to read them again when that helps. Nothing when they can. */
export function UsageNote({ view }: { view: UsageView }) {
  const { note } = view
  if (note === null) return null
  return (
    <p className={styles.usageNote} role={note === 'failed' ? 'alert' : 'status'}>
      {WORDS[note]}
      {note === 'reading' ? null : (
        <button type="button" className={styles.usageNoteButton} onClick={view.refresh}>
          {note === 'failed' ? 'Try again' : 'Read again'}
        </button>
      )}
    </p>
  )
}
