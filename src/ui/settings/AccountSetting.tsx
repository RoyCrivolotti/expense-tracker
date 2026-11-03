import { cloudflareAccessLogoutUrl } from 'folio-shell'
import { Card, SectionTitle } from '../components/primitives'
import styles from './AccountSetting.module.css'

/** Signing out must not wait on a store that does not answer. */
const FORGET_WAIT_MS = 1000

/**
 * Takes this device's saved copies with the session: after signing out, a launch with no network would otherwise open
 * on them, for the person who just left. Then goes where the link goes, whatever became of the clean-up.
 */
async function signOut(href: string): Promise<void> {
  const forget = import('../../data/savedCopy').then((copy) => copy.forgetSavedCopies())
  const wait = new Promise((resolve) => setTimeout(resolve, FORGET_WAIT_MS))
  await Promise.race([forget.catch(() => undefined), wait])
  window.location.assign(href)
}

export function AccountSetting({ email }: { email: string }) {
  const logoutHref = cloudflareAccessLogoutUrl()
  return (
    <>
      <SectionTitle>Account</SectionTitle>
      <Card>
        <div className={styles.row}>
          <div>
            <p className={styles.label}>Signed in as</p>
            <p className={styles.email}>{email}</p>
          </div>
          <a
            className={styles.logout}
            href={logoutHref}
            onClick={(event) => {
              event.preventDefault()
              void signOut(logoutHref)
            }}
          >
            Sign out
          </a>
        </div>
      </Card>
    </>
  )
}
