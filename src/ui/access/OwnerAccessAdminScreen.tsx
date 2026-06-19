import { useEffect, useState } from 'react'
import {
  fetchActiveAccessUsers,
  fetchPendingAccessRequests,
  type ActiveAccessUser,
  type PendingAccessRequest,
} from '../../data/accessApi'
import { SectionTitle } from '../components/primitives'
import { ActiveUsersSection } from './ActiveUsersSection'
import { PendingRequestsSection } from './PendingRequestsSection'
import styles from './AccessScreen.module.css'

export function OwnerAccessAdminScreen() {
  const [requests, setRequests] = useState<PendingAccessRequest[]>([])
  const [users, setUsers] = useState<ActiveAccessUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchPendingAccessRequests(), fetchActiveAccessUsers()])
      .then(([pending, activeUsers]) => {
        if (!active) return
        setRequests(pending.requests)
        setUsers(activeUsers.users)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className={styles.adminPage}>
      <header className={styles.adminHeader}>
        <h1 className={styles.title}>Access management</h1>
        <a className={styles.backLink} href="/">
          Back to app
        </a>
      </header>

      {loading ? <p className={styles.body}>Loading…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {!loading && !error ? (
        <>
          <SectionTitle>Pending requests</SectionTitle>
          <PendingRequestsSection requests={requests} onChange={setRequests} />

          <SectionTitle>Active users</SectionTitle>
          <ActiveUsersSection users={users} onChange={setUsers} />
        </>
      ) : null}
    </div>
  )
}
