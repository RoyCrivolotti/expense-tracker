import { Card, SectionTitle } from '../components/primitives'
import styles from './AccessRequestsSetting.module.css'

export function AccessRequestsSetting({ pendingCount }: { pendingCount: number }) {
  return (
    <>
      <SectionTitle>Admin</SectionTitle>
      <Card>
        <div className={styles.row}>
          <p className={styles.hint}>
            Approve or reject requests, revoke access, and review last-seen activity.
          </p>
          <a className={styles.link} href="/access/admin">
            Manage access
            {pendingCount > 0 ? (
              <span className={styles.badge} aria-label={`${pendingCount} pending`}>
                {pendingCount}
              </span>
            ) : null}
          </a>
        </div>
      </Card>
    </>
  )
}
