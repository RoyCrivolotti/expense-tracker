import type { Transaction } from '../../types'
import { saveLabel } from './transactionSaveLabel'
import styles from './TransactionForm.module.css'

interface SaveButtonsProps {
  view: 'fields' | 'installment'
  /** Set when this form is one of a queue of captured payments. */
  queue: { left: number; onSkip: () => void } | undefined
  busy: boolean
  uploading: { done: number; total: number } | null
  editing: Transaction | null
  retrying: boolean
}

/** The form's save button, and "Don't add" beside it when the payment came from a queue of captured ones. */
export function SaveButtons({ view, queue, busy, uploading, editing, retrying }: SaveButtonsProps) {
  return (
    <>
      {view === 'fields' && queue && (
        <button type="button" className={styles.secondary} disabled={busy} onClick={queue.onSkip}>
          Don&apos;t add
        </button>
      )}
      <button type="submit" className={`${styles.save} tapActive`} disabled={busy}>
        {saveLabel({ busy, uploading, editing, retrying, queueLeft: queue?.left })}
      </button>
    </>
  )
}
