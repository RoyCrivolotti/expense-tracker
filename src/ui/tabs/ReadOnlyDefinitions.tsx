import type { ExpenseModel } from '../useExpenseData'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { Money } from '../components/Money'
import { Card, Pill, SectionTitle } from '../components/primitives'
import styles from './tabs.module.css'
import defStyles from '../definitions/definitions.module.css'

/** The same muted line the editable lists show when empty, so the section looks alike for every reader. */
function EmptyLine({ children }: { children: string }) {
  return <p className={`${defStyles.deleteNote} ${defStyles.emptyNote}`}>{children}</p>
}

/** The setup lists for a reader who cannot edit them. */
export function Definitions({ model }: { model: ExpenseModel }) {
  const { dataset } = model
  const budgetTotal = dataset.categories.reduce((s, c) => s + c.monthlyBudgetCents, 0)
  const budgeted = dataset.categories.filter((c) => c.monthlyBudgetCents > 0)
  return (
    <>
      <SectionTitle>Categories</SectionTitle>
      <Card>
        {budgeted.length === 0 && <EmptyLine>No categories yet.</EmptyLine>}
        {budgeted.map((c) => (
          <div key={c.id} className={styles.defRow}>
            <span>{c.name}</span>
            <Money cents={c.monthlyBudgetCents} />
          </div>
        ))}
        <div className={`${styles.defRow} ${styles.defTotal}`}>
          <span>Total monthly budget</span>
          <Money cents={budgetTotal} />
        </div>
      </Card>

      <SectionTitle>Accounts</SectionTitle>
      <Card>
        {dataset.accounts.length === 0 && <EmptyLine>No accounts yet.</EmptyLine>}
        {dataset.accounts.map((a) => (
          <div key={a.id} className={styles.defRow}>
            <span>{a.name}</span>
            <Pill tone={a.settlement === 'immediate' ? 'success' : 'neutral'}>
              {a.settlement === 'immediate' ? 'Debit · posts instantly' : 'Card · posts when paid'}
            </Pill>
          </div>
        ))}
      </Card>

      <SectionTitle>New transactions</SectionTitle>
      <Card>
        <div className={styles.defRow}>
          <span>Default account</span>
          <span>
            {dataset.accounts.find((a) => a.id === resolveDefaultAccountId(dataset.accounts, dataset.settings))?.name ??
              '—'}
          </span>
        </div>
      </Card>

      <SectionTitle>Opening balances</SectionTitle>
      <Card>
        <div className={styles.defRow}>
          <span>Cash (1 Jan)</span>
          <Money cents={dataset.settings.openingCashCents} />
        </div>
        <div className={styles.defRow}>
          <span>Investments (1 Jan)</span>
          <Money cents={dataset.settings.openingInvestmentCents} />
        </div>
      </Card>
    </>
  )
}
