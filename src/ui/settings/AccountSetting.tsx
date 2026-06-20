import { cloudflareAccessLogoutUrl } from 'folio-shell'
import { Card, SectionTitle } from '../components/primitives'
import styles from './AccountSetting.module.css'

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
          <a className={styles.logout} href={logoutHref}>
            Sign out
          </a>
        </div>
      </Card>
    </>
  )
}
