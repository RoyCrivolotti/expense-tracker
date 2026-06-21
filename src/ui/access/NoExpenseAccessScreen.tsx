import { getSiteUrls } from 'folio-shell'
import styles from './AccessScreen.module.css'

/** Shown when the user is allowlisted but lacks the expenses group grant. */
export function NoExpenseAccessScreen({ email }: { email: string }) {
  const { adminHub } = getSiteUrls()
  const hubUrl = adminHub.replace(/\/$/, '') || adminHub

  return (
    <div className={styles.center}>
      <h1 className={styles.title}>No expense tracker access</h1>
      <p className={styles.body}>
        Signed in as <strong>{email}</strong>. Your account does not include the expense tracker.
        Other private resources may still be available from the admin hub.
      </p>
      <p className={styles.body}>
        <a className={styles.backLink} href={hubUrl}>
          Open admin hub
        </a>
      </p>
    </div>
  )
}
