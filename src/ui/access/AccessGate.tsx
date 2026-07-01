import { useEffect, useState } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import { fetchAccessStatus, type AccessStatusResponse } from '../../data/accessApi'
import { OwnerAccessAdminScreen } from './OwnerAccessAdminScreen'
import { AllowedAccessView, DeniedAccessView } from './AccessGateViews'
import { AccessConnectionError } from './AccessConnectionError'
import { AppLoadingSkeleton } from '../components/AppLoadingSkeleton'

function isAdminPath(): boolean {
  return window.location.pathname.startsWith('/access/admin')
}

export function AccessGate({ source }: { source: ExpenseDataSource }) {
  const [access, setAccess] = useState<AccessStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (isAdminPath()) return
    let active = true
    fetchAccessStatus()
      .then((status) => {
        if (active) setAccess(status)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      active = false
    }
  }, [attempt])

  if (isAdminPath()) return <OwnerAccessAdminScreen />
  if (error) {
    return (
      <AccessConnectionError
        error={error}
        onRetry={() => {
          setError(null)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (!access) return <AppLoadingSkeleton label="Checking access" />
  if (access.status === 'allowed') return <AllowedAccessView access={access} source={source} />
  return <DeniedAccessView access={access} />
}
