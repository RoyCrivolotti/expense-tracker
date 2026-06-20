import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@crivolotti/folio-ui/theme/tokens.css'
import './ui/theme.css'
import { initExpenseTheme } from './ui/hooks/expenseThemeInit'
import { resolveSource } from './data/resolveSource'
import { ExpensesApp } from './ui/ExpensesApp'
import { AccessGate } from './ui/access/AccessGate'
import { OwnerAccessAdminScreen } from './ui/access/OwnerAccessAdminScreen'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

initExpenseTheme()

void resolveSource().then((source) => {
  if (import.meta.env.DEV && window.location.pathname.startsWith('/access/admin')) {
    createRoot(root).render(
      <StrictMode>
        <OwnerAccessAdminScreen />
      </StrictMode>,
    )
    return
  }

  const App = import.meta.env.DEV ? ExpensesApp : AccessGate
  const ownerAccess = import.meta.env.VITE_DOCS_CAPTURE ? { pendingCount: 1 } : undefined
  createRoot(root).render(
    <StrictMode>
      <App source={source} {...(ownerAccess ? { ownerAccess } : {})} />
    </StrictMode>,
  )
})
