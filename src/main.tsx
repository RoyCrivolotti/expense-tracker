import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@crivolotti/site-ui/theme/tokens.css'
import './ui/theme.css'
import { initExpenseTheme } from './ui/hooks/expenseThemeInit'
import { resolveSource } from './data/resolveSource'
import { ExpensesApp } from './ui/ExpensesApp'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

initExpenseTheme()

void resolveSource().then((source) => {
  createRoot(root).render(
    <StrictMode>
      <ExpensesApp source={source} />
    </StrictMode>,
  )
})
