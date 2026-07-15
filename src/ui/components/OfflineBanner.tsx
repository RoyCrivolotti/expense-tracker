import { OfflineCloudIcon } from '../icons'
import { formatRelativeTime } from '../access/formatRelativeTime'
import styles from './OfflineBanner.module.css'

interface Props {
  snapshotAt?: string
}

export function OfflineBanner({ snapshotAt }: Props) {
  const when = snapshotAt ? formatRelativeTime(snapshotAt) : 'your last visit'
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.iconWrap} aria-hidden>
        <OfflineCloudIcon />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>You&apos;re offline</p>
        <p className={styles.sub}>
          Viewing saved data from {when}. Editing is disabled until you reconnect.
        </p>
      </div>
    </div>
  )
}
