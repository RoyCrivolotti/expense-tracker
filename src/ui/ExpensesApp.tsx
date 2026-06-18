import { useState } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import { useExpenseData, type ExpenseModel } from './useExpenseData'
import { useExpenseActions } from './useExpenseActions'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { useExpenseTheme, type ExpenseTheme } from './hooks/useExpenseTheme'
import { AppShell } from './nav/AppShell'
import type { TabId } from './nav/navItems'
import { MonthPicker } from './components/MonthPicker'
import { TransactionModal } from './components/TransactionModal'
import { DashboardTab } from './tabs/DashboardTab'
import { TransactionsTab } from './tabs/TransactionsTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { SettingsTab } from './tabs/SettingsTab'
import styles from './ExpensesApp.module.css'

function TabView({
  tab,
  model,
  month,
  actions,
  theme,
  onThemeChange,
}: {
  tab: TabId
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
}) {
  switch (tab) {
    case 'transactions':
      return <TransactionsTab model={model} month={month} actions={actions} />
    case 'analytics':
      return <AnalyticsTab model={model} actions={actions} />
    case 'settings':
      return (
        <SettingsTab model={model} actions={actions} theme={theme} onThemeChange={onThemeChange} />
      )
    default:
      return <DashboardTab model={model} month={month} actions={actions} />
  }
}

export function ExpensesApp({ source }: { source: ExpenseDataSource }) {
  const data = useExpenseData(source)
  const [theme, setTheme] = useExpenseTheme()
  const [tab, setTab] = useState<TabId>('dashboard')
  const [month, setMonth] = useState<string | null>(null)
  const [modal, setModal] = useState<ExpenseModalState>(null)
  const actions = useExpenseActions(source, data.reload, setModal)

  if (data.status === 'loading') return <div className={styles.center}>Loading…</div>
  if (data.status === 'error' || !data.model) {
    return <div className={styles.center}>Couldn't load expense data: {data.error}</div>
  }

  const model = data.model
  const activeMonth = month ?? model.months[model.months.length - 1] ?? ''
  const showPicker = tab !== 'settings' && model.months.length > 0

  return (
    <AppShell
      activeId={tab}
      onSelect={setTab}
      title="Expenses"
      {...(actions ? { onAdd: actions.onAdd } : {})}
      {...(showPicker
        ? {
            headerRight: (
              <MonthPicker months={model.months} value={activeMonth} onChange={setMonth} />
            ),
          }
        : {})}
    >
      <TabView
        tab={tab}
        model={model}
        month={activeMonth}
        actions={actions}
        theme={theme}
        onThemeChange={setTheme}
      />
      {modal && (
        <TransactionModal
          model={model}
          source={source}
          editing={modal.mode === 'edit' ? modal.txn : null}
          onClose={() => setModal(null)}
          reload={data.reload}
        />
      )}
    </AppShell>
  )
}
