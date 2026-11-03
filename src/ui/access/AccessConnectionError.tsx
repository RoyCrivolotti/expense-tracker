import { classifyAccessError, isStandaloneDisplay, type AccessErrorKind } from './accessErrorKind'
import { AccessDiagnosticsPanel } from './AccessDiagnosticsPanel'
import styles from './AccessScreen.module.css'

interface Props {
  error: string
  onRetry: () => void
}

function wording(kind: AccessErrorKind, offline: boolean, error: string): { title: string; body: string } {
  if (offline) {
    return {
      title: 'You’re offline',
      body: 'There is no saved data on this device yet. Connect to the internet, then try again.',
    }
  }
  if (kind !== 'connection') {
    return {
      title: 'Couldn’t check access',
      body: kind === 'auth' ? 'Your session may have expired. Sign in again to continue.' : error,
    }
  }
  return {
    title: 'Can’t reach the server',
    body: isStandaloneDisplay()
      ? 'The home-screen app signs in separately from Safari. Use Sign in below to open the Google login in this app.'
      : 'Check your connection, then try again or sign in.',
  }
}

export function AccessConnectionError({ error, onRetry }: Props) {
  const kind = classifyAccessError(error)
  // Sign in goes to `/`, which with no network lands on this screen again, so offline there is only a retry to offer.
  const offline = kind === 'connection' && navigator.onLine === false
  const { title, body } = wording(kind, offline, error)

  return (
    <div className={styles.center}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        {offline ? null : (
          <button type="button" onClick={() => window.location.assign('/')}>
            Sign in
          </button>
        )}
        <button type="button" className={offline ? undefined : styles.secondaryBtn} onClick={onRetry}>
          Try again
        </button>
      </div>
      <AccessDiagnosticsPanel error={error} />
      {kind === 'other' ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
