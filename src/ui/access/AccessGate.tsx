import { useEffect, useState } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import { fetchAccessStatus, type AccessStatusResponse } from '../../data/accessApi'
import { OwnerAccessAdminScreen } from './OwnerAccessAdminScreen'
import { AllowedAccessView, DeniedAccessView } from './AccessGateViews'
import styles from '../ExpensesApp.module.css'

function isAdminPath(): boolean {
  return window.location.pathname.startsWith('/access/admin')
}

export function AccessGate({ source }: { source: ExpenseDataSource }) {
  const [access, setAccess] = useState<AccessStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

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
  }, [])

  if (isAdminPath()) return <OwnerAccessAdminScreen />
  if (error) return <div className={styles.center}>Couldn&apos;t check access: {error}</div>
  if (!access) return <div className={styles.center}>Loading…</div>
  if (access.status === 'allowed') return <AllowedAccessView access={access} source={source} />
  return <DeniedAccessView access={access} />
}
