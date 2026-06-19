import { useState } from 'react'
import { fetchAccessStatus, requestAccess, type AccessStatusResponse } from '../../data/accessApi'
import { Pill } from '../components/primitives'
import { formatDateTime, formatRelativeTime } from './formatRelativeTime'
import styles from './AccessScreen.module.css'

function statusPill(status: AccessStatusResponse['status']) {
  if (status === 'pending') return <Pill tone="warning">Pending approval</Pill>
  if (status === 'rejected') return <Pill tone="danger">Access denied</Pill>
  return null
}

function statusMessage(access: AccessStatusResponse): string {
  if (access.status === 'pending') {
    return 'Your request is waiting for the owner to approve it in the app.'
  }
  if (access.status === 'rejected') {
    return 'Your previous request was denied. You can submit a new request below.'
  }
  return 'Request access to use the expense tracker.'
}

export function RequestAccessScreen({
  email,
  initialAccess,
}: {
  email: string
  initialAccess: { status: AccessStatusResponse['status']; requestedAt?: string }
}) {
  const [access, setAccess] = useState(initialAccess)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onRequest() {
    setBusy(true)
    setError(null)
    try {
      await requestAccess()
      setAccess({ status: 'pending', requestedAt: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const next = await fetchAccessStatus()
      setAccess({
        status: next.status,
        ...(next.requestedAt ? { requestedAt: next.requestedAt } : {}),
      })
      if (next.status === 'allowed') window.location.assign('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  const showRequest = access.status === 'none' || access.status === 'rejected'

  return (
    <div className={styles.center}>
      <h1 className={styles.title}>Expense tracker</h1>
      <p className={styles.body}>
        Signed in as <span className={styles.email}>{email}</span>.
      </p>
      {statusPill(access.status)}
      <p className={styles.body}>{statusMessage({ ...access, email })}</p>
      {access.requestedAt ? (
        <p className={styles.requestedAt} title={formatDateTime(access.requestedAt)}>
          Requested {formatRelativeTime(access.requestedAt)}
        </p>
      ) : null}
      <div className={styles.actions}>
        {showRequest ? (
          <button type="button" disabled={busy} onClick={() => void onRequest()}>
            {busy ? 'Sending…' : access.status === 'rejected' ? 'Request again' : 'Request access'}
          </button>
        ) : null}
        <button type="button" className={styles.secondaryBtn} disabled={refreshing} onClick={() => void onRefresh()}>
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
