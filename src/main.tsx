import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { StagingFrame } from 'folio-shell'
import 'folio-shell/theme/tokens.css'
import './ui/theme.css'
import { initExpenseTheme } from './ui/hooks/expenseThemeInit'
import { ToastProvider } from './ui/hooks/ToastProvider'
import { PwaUpdatePrompt } from './ui/hooks/PwaUpdatePrompt'
import { reloadWhenWorkerReplaced } from './ui/hooks/reloadWhenWorkerReplaced'
import { reloadPageWhenNothingOpen } from './ui/hooks/reloadPage'
import { reloadOnChunkError } from './ui/hooks/reloadOnChunkError'
import { trackTypingFocus } from './ui/hooks/updateReloadHold'
import { resolveSource } from './data/resolveSource'
import { ExpensesApp } from './ui/ExpensesApp'
import { AccessGate } from './ui/access/AccessGate'
import { OwnerAccessAdminScreen } from './ui/access/OwnerAccessAdminScreen'
import { allGroupsGranted } from './domain/accessGroups'
import { stagingProductionUrl } from './config/staging'
import { LazyViewportDebug } from './ui/debug/LazyViewportDebug'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')
const root = createRoot(container)

initExpenseTheme()
// Only a production build has a worker. Listening from the first line of the app, not from a component, so a worker that
// takes over while the page is still starting is not missed.
if (import.meta.env.PROD) {
  reloadWhenWorkerReplaced(navigator.serviceWorker, reloadPageWhenNothingOpen)
  trackTypingFocus()
  reloadOnChunkError(
    window,
    window.sessionStorage,
    import.meta.env.VITE_BUILD_ID ?? 'unknown',
    reloadPageWhenNothingOpen,
  )
}

function renderApp(node: ReactNode) {
  root.render(
    <StrictMode>
      <StagingFrame productionUrl={stagingProductionUrl}>
        <ToastProvider>
          <PwaUpdatePrompt />
          {node}
          <LazyViewportDebug />
        </ToastProvider>
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
    renderApp(<ExpensesApp source={source} hubGrants={allGroupsGranted()} {...(ownerAccess ? { ownerAccess } : {})} />)
    return
  }

  renderApp(<AccessGate source={source} />)
})
