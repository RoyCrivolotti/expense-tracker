import { useState } from 'react'
import { requestAccess } from '../../data/accessApi'
import styles from './AccessScreen.module.css'

export function RequestAccessScreen({
  email,
  initialStatus,
}: {
  email: string
  initialStatus: 'none' | 'pending'
}) {
  const [status, setStatus] = useState(initialStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onRequest() {
    setBusy(true)
    setError(null)
    try {
      await requestAccess()
      setStatus('pending')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.center}>
      <h1 className={styles.title}>Expense tracker</h1>
      {status === 'pending' ? (
        <p className={styles.body}>
          Access requested for <span className={styles.email}>{email}</span>. You will receive an
          email when approved.
        </p>
      ) : (
        <>
          <p className={styles.body}>
            Signed in as <span className={styles.email}>{email}</span>. Request access to use the
            expense tracker.
          </p>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => void onRequest()}>
              {busy ? 'Sending…' : 'Request access'}
            </button>
          </div>
        </>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
