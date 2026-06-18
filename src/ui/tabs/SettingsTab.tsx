import type { ExpenseTheme } from '../hooks/useExpenseTheme'
import type { ExpenseModel } from '../useExpenseData'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import type { ExpenseActions } from '../actions'
import { Money } from '../components/Money'
import { Card, EmptyState, Pill, SectionTitle } from '../components/primitives'
import { StatementToggles } from '../components/StatementToggles'
import { DefinitionsEditor } from '../definitions/DefinitionsEditor'
import { AppearanceSetting } from '../settings/AppearanceSetting'
import { DefaultAccountSetting } from '../settings/DefaultAccountSetting'
import styles from './tabs.module.css'

interface SettingsTabProps {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
}

function Definitions({ model }: { model: ExpenseModel }) {
  const { dataset } = model
  const budgetTotal = dataset.categories.reduce((s, c) => s + c.monthlyBudgetCents, 0)
  return (
    <>
      <SectionTitle>Categories</SectionTitle>
      <Card>
        {dataset.categories
          .filter((c) => c.monthlyBudgetCents > 0)
          .map((c) => (
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
            {dataset.accounts.find(
              (a) => a.id === resolveDefaultAccountId(dataset.accounts, dataset.settings),
            )?.name ?? '—'}
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
        <div className={styles.defRow}>
          <span>Liquid net worth</span>
          <Money cents={dataset.settings.liquidNetWorthCents} />
        </div>
      </Card>
    </>
  )
}

export function SettingsTab({ model, actions, theme, onThemeChange }: SettingsTabProps) {
  return (
    <div className={styles.stack}>
      <AppearanceSetting theme={theme} onChange={onThemeChange} />

      {actions && (
        <DefaultAccountSetting
          accounts={model.dataset.accounts}
          settings={model.dataset.settings}
          onChange={(accountId) => void actions.updateSettings({ defaultAccountId: accountId })}
        />
      )}

      {actions && (
        <>
          <SectionTitle>Card statements</SectionTitle>
          <Card>
            {model.months.length === 0 ? (
              <EmptyState>No data yet — add transactions to get started.</EmptyState>
            ) : (
              <StatementToggles model={model} onToggle={actions.setStatementPaid} />
            )}
          </Card>
        </>
      )}

      {actions ? (
        <DefinitionsEditor model={model} actions={actions} />
      ) : (
        <Definitions model={model} />
      )}
    </div>
  )
}
