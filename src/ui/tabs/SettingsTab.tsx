import { useMemo, useState } from 'react'
import type { ExpenseTheme } from '../hooks/useExpenseTheme'
import type { ExpenseModel } from '../useExpenseData'
import { needsOnboarding } from '../../domain/onboarding/needsOnboarding'
import type { ExpenseActions } from '../actions'
import type { ExpenseSettings } from '../../types'
import { Card, EmptyState, SectionTitle } from '../components/primitives'
import { SectionTabs } from '../components/SectionTabs'
import { StatementToggles } from '../components/StatementToggles'
import { DefinitionsEditor } from '../definitions/DefinitionsEditor'
import { AppearanceSetting } from '../settings/AppearanceSetting'
import { PreferencesSetting } from '../settings/PreferencesSetting'
import { ReportNameSetting } from '../settings/ReportNameSetting'
import { ReceiptStorageSetting } from '../settings/ReceiptStorageSetting'
import { HelpSetting } from '../settings/HelpSetting'
import { DefaultAccountSetting } from '../settings/DefaultAccountSetting'
import { StoppedSuggestionsSetting } from '../settings/StoppedSuggestionsSetting'
import { ExportDataSection } from '../settings/ExportDataSection'
import { ImportDataSection } from '../settings/ImportDataSection'
import { AccountView } from '../settings/AccountView'
import { CaptureView } from '../settings/CaptureView'
import { Definitions } from './ReadOnlyDefinitions'

export type SettingsView = 'preferences' | 'setup' | 'account' | 'capture' | 'data'

const VIEW_OPTIONS: { value: SettingsView; label: string }[] = [
  { value: 'preferences', label: 'Preferences' },
  { value: 'setup', label: 'Setup' },
  { value: 'account', label: 'Account' },
  { value: 'capture', label: 'Capture' },
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
  /** The section to open on, when something sent the person here for it. */
  entry?: SettingsView | null | undefined
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
        <OwnerPreferences settings={model.dataset.settings} onChange={(patch) => actions.updateSettings(patch)} />
      )}

      {actions && (
        <DefaultAccountSetting
          accounts={model.dataset.accounts}
          categories={model.dataset.categories}
          settings={model.dataset.settings}
          onChange={(patch) => void actions.updateSettings(patch)}
        />
      )}

      {actions && (
        <StoppedSuggestionsSetting
          transactions={model.dataset.transactions}
          known={model.newestCharges}
          watch={model.watchHistory}
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
      {actions && onRunSetup && <HelpSetting firstRun={needsOnboarding(model.dataset)} onRunSetup={onRunSetup} />}

      {actions ? <DefinitionsEditor model={model} actions={actions} /> : <Definitions model={model} />}

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

function DataView({
  model,
  month,
  actions,
}: {
  model: ExpenseModel
  month: string
  actions: ExpenseActions | undefined
}) {
  const { ensureReceipts, attachmentCounts } = model
  const ensureAll = useMemo(
    () => (ensureReceipts ? () => ensureReceipts(Object.keys(attachmentCounts ?? {}).map(Number)) : undefined),
    [ensureReceipts, attachmentCounts],
  )
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

      <ReceiptStorageSetting
        attachments={model.dataset.attachments}
        pending={model.receiptsPending ?? 0}
        {...(ensureAll ? { ensureAll } : {})}
      />
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
  entry,
}: SettingsTabProps) {
  const [view, setView] = useState<SettingsView>(entry ?? 'preferences')

  return (
    <SectionTabs
      id="settings-section"
      ariaLabel="Settings section"
      options={VIEW_OPTIONS}
      value={view}
      onChange={setView}
    >
      {view === 'preferences' && (
        <PreferencesView model={model} actions={actions} theme={theme} onThemeChange={onThemeChange} />
      )}

      {view === 'setup' && <SetupView model={model} actions={actions} onRunSetup={onRunSetup} />}

      {view === 'account' && <AccountView model={model} ownerAccess={ownerAccess} accountEmail={accountEmail} />}

      {view === 'capture' && <CaptureView model={model} />}

      {view === 'data' && <DataView model={model} month={month} actions={actions} />}
    </SectionTabs>
  )
}
