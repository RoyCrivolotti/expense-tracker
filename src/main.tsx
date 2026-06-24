import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { StagingFrame } from 'folio-shell'
import 'folio-shell/theme/tokens.css'
import './ui/theme.css'
import { initExpenseTheme } from './ui/hooks/expenseThemeInit'
import { ToastProvider } from './ui/hooks/ToastProvider'
import { resolveSource } from './data/resolveSource'
import { ExpensesApp } from './ui/ExpensesApp'
import { AccessGate } from './ui/access/AccessGate'
import { OwnerAccessAdminScreen } from './ui/access/OwnerAccessAdminScreen'
import { allGroupsGranted } from './domain/accessGroups'
import { stagingProductionUrl } from './config/staging'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')
const root = createRoot(container)

initExpenseTheme()

function renderApp(node: ReactNode) {
  root.render(
    <StrictMode>
      <StagingFrame productionUrl={stagingProductionUrl}>
        <ToastProvider>{node}</ToastProvider>
      </StagingFrame>
    </StrictMode>,
  )
}

void resolveSource().then((source) => {
  if (import.meta.env.DEV && window.location.pathname.startsWith('/access/admin')) {
    renderApp(<OwnerAccessAdminScreen />)
    return
  }

  const ownerAccess = import.meta.env.VITE_DOCS_CAPTURE ? { pendingCount: 1 } : undefined
  if (import.meta.env.DEV) {
    renderApp(
      <ExpensesApp source={source} hubGrants={allGroupsGranted()} {...(ownerAccess ? { ownerAccess } : {})} />,
    )
    return
  }

  renderApp(<AccessGate source={source} />)
})
