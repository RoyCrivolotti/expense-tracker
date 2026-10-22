import type { UsageView } from './definitions/recordUsage'
import styles from './definitions/definitions.module.css'
import { NOTE_WORDS } from './ledgerUsageWords'

/** Says why the counts beside it cannot be taken as they are, and offers to read them again when that helps. */
export function UsageNote({ note, refresh }: { note: NonNullable<UsageView['note']>; refresh: () => void }) {
  return (
    <p className={styles.usageNote} role={note === 'failed' ? 'alert' : 'status'}>
      {NOTE_WORDS[note]}
      {note === 'reading' ? null : (
        <button type="button" className={styles.usageNoteButton} onClick={refresh}>
          {note === 'failed' ? 'Try again' : 'Read again'}
        </button>
      )}
    </p>
  )
}
