import styles from './tabs.module.css'

interface BatchBarProps {
  count: number
  busy: boolean
  editOpen: boolean
  onEdit: () => void
  onDelete: () => void
}

export function BatchBar({ count, busy, editOpen, onEdit, onDelete }: BatchBarProps) {
  const deleting = busy && !editOpen
  return (
    <div className={styles.batchBar}>
      <span>{count} selected</span>
      <div className={styles.batchActions}>
        <button
          type="button"
          className={styles.batchEdit}
          disabled={count === 0 || busy}
          onClick={onEdit}
        >
          Edit selected
        </button>
        <button
          type="button"
          className={styles.batchDelete}
          disabled={count === 0 || busy}
          onClick={onDelete}
        >
          {deleting ? 'Deleting…' : 'Delete selected'}
        </button>
      </div>
    </div>
  )
}
