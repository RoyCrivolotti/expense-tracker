import { classifyAccessError, isStandaloneDisplay } from './accessErrorKind'
import styles from './AccessScreen.module.css'

interface Props {
  error: string
  onRetry: () => void
}

export function AccessConnectionError({ error, onRetry }: Props) {
  const kind = classifyAccessError(error)
  const standalone = isStandaloneDisplay()

  const title =
    kind === 'connection' ? 'Can\u2019t reach the server' : 'Couldn\u2019t check access'

  let body: string
  if (kind === 'connection' && standalone) {
    body =
      'The home-screen app signs in separately from Safari. Use Sign in below to open the Google login in this app.'
  } else if (kind === 'auth') {
    body = 'Your session may have expired. Sign in again to continue.'
  } else if (kind === 'connection') {
    body = 'Check your connection, then try again or sign in.'
  } else {
    body = error
  }

  return (
    <div className={styles.center}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => window.location.assign('/')}>
          Sign in
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onRetry}>
          Try again
        </button>
      </div>
      {kind === 'other' ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
