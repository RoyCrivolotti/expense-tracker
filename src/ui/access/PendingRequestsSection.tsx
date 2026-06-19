import { useState } from 'react'
import {
  approveAccessRequest,
  rejectAccessRequest,
  type PendingAccessRequest,
} from '../../data/accessApi'
import { Card, Pill } from '../components/primitives'
import { formatDateTime, formatRelativeTime } from './formatRelativeTime'
import styles from './AccessScreen.module.css'

export function PendingRequestsSection({
  requests,
  onChange,
}: {
  requests: PendingAccessRequest[]
  onChange: (next: PendingAccessRequest[]) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(
    requestId: string,
    action: 'approve' | 'reject',
    email: string,
  ) {
    setBusyId(requestId)
    setError(null)
    try {
      if (action === 'approve') await approveAccessRequest(requestId)
      else await rejectAccessRequest(requestId)
      onChange(requests.filter((row) => row.id !== requestId))
      setToast(action === 'approve' ? `Approved ${email}` : `Rejected ${email}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0) {
    return <p className={styles.emptyHint}>No pending requests.</p>
  }

  return (
    <>
      {toast ? <p className={styles.toast}>{toast}</p> : null}
      <ul className={styles.requestList}>
        {requests.map((row) => (
          <li key={row.id}>
            <Card className={styles.requestCard}>
              <div className={styles.requestMeta}>
                <span className={styles.email}>{row.email}</span>
                <span className={styles.requestedAt} title={formatDateTime(row.requestedAt)}>
                  Requested {formatRelativeTime(row.requestedAt)}
                </span>
                <Pill tone="warning">Pending</Pill>
              </div>
              <div className={styles.requestActions}>
                <button
                  type="button"
                  className={styles.approveBtn}
                  disabled={busyId === row.id}
                  onClick={() => void handle(row.id, 'approve', row.email)}
                >
                  {busyId === row.id ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className={styles.rejectBtn}
                  disabled={busyId === row.id}
                  onClick={() => void handle(row.id, 'reject', row.email)}
                >
                  Reject
                </button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {error ? <p className={styles.error}>{error}</p> : null}
    </>
  )
}
