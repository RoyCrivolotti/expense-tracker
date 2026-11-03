import { useEffect, useState } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import { fetchAccessStatus, type AccessStatusResponse } from '../../data/accessApi'
import { ApiError, isAccessDenied } from '../../data/apiClient'
import { OwnerAccessAdminScreen } from './OwnerAccessAdminScreen'
import { lacksExpenseAccess } from '../../hubNavItems'
import { AllowedAccessView, DeniedAccessView } from './AccessGateViews'
import { AccessFailure } from './AccessFailure'
import { AppLoadingSkeleton } from '../components/AppLoadingSkeleton'

function isAdminPath(): boolean {
  return window.location.pathname.startsWith('/access/admin')
}

/** The server said the person may not read what this device kept (not allowed, or not into Expenses), so none of it stays for the next time the network is out. */
function dropSavedCopies(): void {
  void import('../../data/savedCopy').then((copy) => copy.forgetSavedCopies(), () => undefined)
}

export function AccessGate({ source }: { source: ExpenseDataSource }) {
  const [access, setAccess] = useState<AccessStatusResponse | null>(null)
  const [failure, setFailure] = useState<{ message: string; answered: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (isAdminPath()) return
    let active = true
    fetchAccessStatus()
      .then((status) => {
        if (!active) return
        if (status.status !== 'allowed' || lacksExpenseAccess(status)) dropSavedCopies()
        setAccess(status)
      })
      .catch((err: unknown) => {
        if (!active) return
        if (isAccessDenied(err)) dropSavedCopies()
        setFailure({ message: err instanceof Error ? err.message : String(err), answered: err instanceof ApiError })
      })
    return () => {
      active = false
    }
  }, [attempt])

  if (isAdminPath()) return <OwnerAccessAdminScreen />
  if (failure) {
    return (
      <AccessFailure
        message={failure.message}
        answered={failure.answered}
        source={source}
        onRetry={() => {
          setFailure(null)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (!access) return <AppLoadingSkeleton label="Checking access" />
  if (access.status === 'allowed') return <AllowedAccessView access={access} source={source} />
  return <DeniedAccessView access={access} />
}
