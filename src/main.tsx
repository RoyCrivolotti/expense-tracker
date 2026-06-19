import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@crivolotti/site-ui/theme/tokens.css'
import './ui/theme.css'
import { initExpenseTheme } from './ui/hooks/expenseThemeInit'
import { resolveSource } from './data/resolveSource'
import { ExpensesApp } from './ui/ExpensesApp'
import { AccessGate } from './ui/access/AccessGate'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

initExpenseTheme()

void resolveSource().then((source) => {
  const App = import.meta.env.DEV ? ExpensesApp : AccessGate
  createRoot(root).render(
    <StrictMode>
      <App source={source} />
    </StrictMode>,
  )
})
