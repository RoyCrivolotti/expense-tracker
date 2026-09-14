import { useState } from 'react'
import type { ExpenseTheme } from '../hooks/useExpenseTheme'
import type { ExpenseModel } from '../useExpenseData'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { needsOnboarding } from '../../domain/onboarding/needsOnboarding'
import type { ExpenseActions } from '../actions'
import { Money } from '../components/Money'
import type { ExpenseSettings } from '../../types'
import { Card, EmptyState, Pill, SectionTitle } from '../components/primitives'
import { SegmentedControl } from '../components/SegmentedControl'
import { StatementToggles } from '../components/StatementToggles'
import { DefinitionsEditor } from '../definitions/DefinitionsEditor'
import { AppearanceSetting } from '../settings/AppearanceSetting'
import { PreferencesSetting } from '../settings/PreferencesSetting'
import { ReportNameSetting } from '../settings/ReportNameSetting'
import { ReceiptStorageSetting } from '../settings/ReceiptStorageSetting'
import { DefaultAccountSetting } from '../settings/DefaultAccountSetting'
import { ExportDataSection } from '../settings/ExportDataSection'
import { ImportDataSection } from '../settings/ImportDataSection'
import { AccountSetting } from '../settings/AccountSetting'
import { AccessRequestsSetting } from '../settings/AccessRequestsSetting'
import styles from './tabs.module.css'

type SettingsView = 'preferences' | 'setup' | 'account' | 'data'

const VIEW_OPTIONS: { value: SettingsView; label: string }[] = [
  { value: 'preferences', label: 'Preferences' },
  { value: 'setup', label: 'Setup' },
  { value: 'account', label: 'Account' },
  { value: 'data', label: 'Data' },
]

interface SettingsTabProps {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
  ownerAccess?: { pendingCount: number } | undefined
  accountEmail?: string | undefined
  onRunSetup?: (() => void) | undefined
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

function SetupWizardEntry({ firstRun, onRunSetup }: { firstRun: boolean; onRunSetup: () => void }) {
  return (
    <>
      <SectionTitle>{firstRun ? 'Get started' : 'Setup wizard'}</SectionTitle>
      <Card>
        <EmptyState actionLabel="Run setup wizard" onAction={onRunSetup}>
          {firstRun
            ? 'Add your categories and accounts to start tracking spending.'
            : 'Revisit currency, budget-month start, categories, and accounts.'}
        </EmptyState>
      </Card>
    </>
  )
}

function OwnerPreferences({
  settings,
  onChange,
}: {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}) {
  return (
    <>
      <PreferencesSetting settings={settings} onChange={onChange} />
      <ReportNameSetting settings={settings} onChange={onChange} />
    </>
  )
}

function PreferencesView({
  model,
  actions,
  theme,
  onThemeChange,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
}) {
  return (
    <>
      <AppearanceSetting theme={theme} onChange={onThemeChange} />

      {actions && (
        <OwnerPreferences
          settings={model.dataset.settings}
          onChange={(patch) => actions.updateSettings(patch)}
        />
      )}

      {actions && (
        <DefaultAccountSetting
          accounts={model.dataset.accounts}
          settings={model.dataset.settings}
          onChange={(accountId) => void actions.updateSettings({ defaultAccountId: accountId })}
        />
      )}
    </>
  )
}

function SetupView({
  model,
  actions,
  onRunSetup,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  onRunSetup: (() => void) | undefined
}) {
  return (
    <>
      {actions && onRunSetup && (
        <SetupWizardEntry firstRun={needsOnboarding(model.dataset)} onRunSetup={onRunSetup} />
      )}

      {actions ? (
        <DefinitionsEditor model={model} actions={actions} />
      ) : (
        <Definitions model={model} />
      )}

      {actions && (
        <>
          <SectionTitle>Card statements</SectionTitle>
          <Card>
            {model.months.length === 0 ? (
              <EmptyState actionLabel="Add transaction" onAction={actions.onAdd}>
                No data yet — add transactions to get started.
              </EmptyState>
            ) : (
              <StatementToggles model={model} onToggle={actions.setStatementPaid} />
            )}
          </Card>
        </>
      )}
    </>
  )
}

function AccountView({
  ownerAccess,
  accountEmail,
}: {
  ownerAccess: { pendingCount: number } | undefined
  accountEmail: string | undefined
}) {
  return (
    <>
      {accountEmail ? <AccountSetting email={accountEmail} /> : null}
      {ownerAccess ? <AccessRequestsSetting pendingCount={ownerAccess.pendingCount} /> : null}
    </>
  )
}

function DataView({
  model,
  month,
  actions,
}: {
  model: ExpenseModel
  month: string
  actions: ExpenseActions | undefined
}) {
  return (
    <>
      <SectionTitle>Export</SectionTitle>
      <Card>
        <ExportDataSection model={model} month={month} />
      </Card>

      {actions && (
        <>
          <SectionTitle>Import</SectionTitle>
          <Card>
            <ImportDataSection model={model} actions={actions} />
          </Card>
        </>
      )}

      <ReceiptStorageSetting attachments={model.dataset.attachments} />
    </>
  )
}

export function SettingsTab({
  model,
  month,
  actions,
  theme,
  onThemeChange,
  ownerAccess,
  accountEmail,
  onRunSetup,
}: SettingsTabProps) {
  const [view, setView] = useState<SettingsView>('preferences')

  return (
    <div className={styles.stack}>
      <div className={styles.settingsTabBar}>
        <SegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          ariaLabel="Settings section"
          layout="bar"
        />
      </div>

      {view === 'preferences' && (
        <PreferencesView model={model} actions={actions} theme={theme} onThemeChange={onThemeChange} />
      )}

      {view === 'setup' && (
        <SetupView model={model} actions={actions} onRunSetup={onRunSetup} />
      )}

      {view === 'account' && (
        <AccountView ownerAccess={ownerAccess} accountEmail={accountEmail} />
      )}

      {view === 'data' && <DataView model={model} month={month} actions={actions} />}
    </div>
  )
}
