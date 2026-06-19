import { useState } from 'react'
import { revokeAccessUser, type ActiveAccessUser } from '../../data/accessApi'
import { Card, Pill } from '../components/primitives'
import { formatDateTime, formatRelativeTime } from './formatRelativeTime'
import styles from './AccessScreen.module.css'

function lastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Never seen'
  return `Last seen ${formatRelativeTime(lastSeenAt)}`
}

export function ActiveUsersSection({
  users,
  onChange,
}: {
  users: ActiveAccessUser[]
  onChange: (next: ActiveAccessUser[]) => void
}) {
  const [busyEmail, setBusyEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onRevoke(email: string) {
    if (!window.confirm(`Revoke access for ${email}?`)) return
    setBusyEmail(email)
    setError(null)
    try {
      await revokeAccessUser(email)
      onChange(users.filter((row) => row.email !== email))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyEmail(null)
    }
  }

  if (users.length === 0) {
    return <p className={styles.emptyHint}>No active users yet.</p>
  }

  return (
    <>
      <ul className={styles.requestList}>
        {users.map((row) => (
            <li key={row.email}>
              <Card className={styles.requestCard}>
                <div className={styles.requestMeta}>
                  <span className={styles.email}>{row.email}</span>
                  <span className={styles.requestedAt} title={formatDateTime(row.grantedAt)}>
                    Granted {formatRelativeTime(row.grantedAt)}
                  </span>
                  <span
                    className={styles.requestedAt}
                    title={row.lastSeenAt ? formatDateTime(row.lastSeenAt) : undefined}
                  >
                    {lastSeenLabel(row.lastSeenAt)}
                  </span>
                  {row.isOwner ? <Pill tone="success">Owner</Pill> : <Pill tone="neutral">Active</Pill>}
                </div>
                {!row.isOwner ? (
                  <div className={styles.requestActions}>
                    <button
                      type="button"
                      className={styles.rejectBtn}
                      disabled={busyEmail === row.email}
                      onClick={() => void onRevoke(row.email)}
                    >
                      {busyEmail === row.email ? 'Revoking…' : 'Revoke'}
                    </button>
                  </div>
                ) : null}
              </Card>
            </li>
        ))}
      </ul>
      {error ? <p className={styles.error}>{error}</p> : null}
    </>
  )
}
