import type { Account, Category, ExpenseSettings } from '../../types'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { resolveInvestmentCategoryId } from '../../data/investmentCategory'
import { Card, SectionTitle } from '../components/primitives'
import styles from '../tabs/tabs.module.css'

interface DefaultAccountSettingProps {
  accounts: Account[]
  categories: Category[]
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void
}

/**
 * What the new-transaction form starts from: the account it pre-selects, and the category
 * every investment is filed under, in both directions, which the form then locks.
 */
export function DefaultAccountSetting({
  accounts,
  categories,
  settings,
  onChange,
}: DefaultAccountSettingProps) {
  const active = accounts.filter((a) => a.active)
  const value = resolveDefaultAccountId(accounts, settings)
  const activeCategories = categories.filter((c) => c.active)
  const investmentCategory = resolveInvestmentCategoryId(categories, settings)

  return (
    <>
      <SectionTitle>New transactions</SectionTitle>
      <Card>
        <label className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Default account</span>
          <select
            className={styles.defaultAccountSelect}
            value={value}
            onChange={(e) => onChange({ defaultAccountId: Number(e.target.value) })}
          >
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Category for investments</span>
          <select
            className={styles.defaultAccountSelect}
            value={investmentCategory ?? ''}
            onChange={(e) =>
              onChange({ investmentCategoryId: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">Not set</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.settingHint}>
          Every Invest and Withdraw transaction is filed under this category; the form locks it
          so investments never land in a spending category.
        </p>
      </Card>
    </>
  )
}
