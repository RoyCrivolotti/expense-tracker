import styles from './tabs.module.css'

interface BatchBarProps {
  count: number
  busy: boolean
  onDelete: () => void
}

export function BatchBar({ count, busy, onDelete }: BatchBarProps) {
  return (
    <div className={styles.batchBar}>
      <span>{count} selected</span>
      <button
        type="button"
        className={styles.batchDelete}
        disabled={count === 0 || busy}
        onClick={onDelete}
      >
        {busy ? 'Deleting…' : 'Delete selected'}
      </button>
    </div>
  )
}
