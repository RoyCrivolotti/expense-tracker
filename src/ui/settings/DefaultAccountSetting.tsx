import type { Account, ExpenseSettings } from '../../types'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { Card, SectionTitle } from '../components/primitives'
import styles from '../tabs/tabs.module.css'

interface DefaultAccountSettingProps {
  accounts: Account[]
  settings: ExpenseSettings
  onChange: (accountId: number) => void
}

/** Persisted default payment account for the new-transaction form. */
export function DefaultAccountSetting({
  accounts,
  settings,
  onChange,
}: DefaultAccountSettingProps) {
  const active = accounts.filter((a) => a.active)
  const value = resolveDefaultAccountId(accounts, settings)

  return (
    <>
      <SectionTitle>New transactions</SectionTitle>
      <Card>
        <label className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Default account</span>
          <select
            className={styles.defaultAccountSelect}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          >
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </Card>
    </>
  )
}
