import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'folio-shell/theme/tokens.css'
import './ui/theme.css'
import { initExpenseTheme } from './ui/hooks/expenseThemeInit'
import { resolveSource } from './data/resolveSource'
import { ExpensesApp } from './ui/ExpensesApp'
import { AccessGate } from './ui/access/AccessGate'
import { OwnerAccessAdminScreen } from './ui/access/OwnerAccessAdminScreen'
import { allGroupsGranted } from './domain/accessGroups'

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

  const ownerAccess = import.meta.env.VITE_DOCS_CAPTURE ? { pendingCount: 1 } : undefined
  createRoot(root).render(
    <StrictMode>
      {import.meta.env.DEV ? (
        <ExpensesApp source={source} hubGrants={allGroupsGranted()} {...(ownerAccess ? { ownerAccess } : {})} />
      ) : (
        <AccessGate source={source} />
      )}
    </StrictMode>,
  )
})
