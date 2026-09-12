import type { ExpenseSettings } from '../../types'
import { Card, SectionTitle } from '../components/primitives'
import styles from '../tabs/tabs.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void
}

/**
 * The name printed on a claim pack.
 *
 * Its own section rather than a line in "Money & months", which is about
 * formatting. Deliberately not derived from the Cloudflare Access email: that
 * identifies the account, not the person, and an address on an expense form
 * reads as a mistake to whoever approves it.
 */
export function ClaimantSetting({ settings, onChange }: Props) {
  return (
    <>
      <SectionTitle>Reimbursement claims</SectionTitle>
      <Card>
        <div className={styles.settingGroup}>
          <label className={styles.defaultAccountField}>
            <span className={styles.defaultAccountLabel}>Claimant name</span>
            <input
              className={styles.defaultAccountSelect}
              type="text"
              autoComplete="name"
              placeholder="e.g. Alex Moreno"
              value={settings.claimantName}
              onChange={(e) => onChange({ claimantName: e.target.value })}
            />
          </label>
          <p className={styles.settingHint}>
            Printed at the top of a claim pack. Leave it empty and the pack omits the claimant line.
          </p>
        </div>
      </Card>
    </>
  )
}
