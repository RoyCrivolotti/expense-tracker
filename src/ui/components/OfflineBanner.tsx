import { OfflineCloudIcon } from '../icons'
import { formatRelativeTime } from '../access/formatRelativeTime'
import styles from './OfflineBanner.module.css'

interface Props {
  online: boolean
  snapshotAt?: string
}

export function OfflineBanner({ online, snapshotAt }: Props) {
  const when = snapshotAt ? formatRelativeTime(snapshotAt) : 'your last visit'
  const title = online ? 'Showing saved data' : "You're offline"
  const sub = online
    ? `Couldn't reach the server (${when}). Tap refresh to update. Editing is disabled until then.`
    : `Viewing saved data from ${when}. Editing is disabled until you reconnect.`

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.iconWrap} aria-hidden>
        <OfflineCloudIcon />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.sub}>{sub}</p>
      </div>
    </div>
  )
}
