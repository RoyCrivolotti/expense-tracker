import { useEffect, useState } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import { fetchAccessStatus, type AccessStatusResponse } from '../../data/accessApi'
import { ExpensesApp } from '../ExpensesApp'
import { OwnerAccessAdminScreen } from './OwnerAccessAdminScreen'
import { RequestAccessScreen } from './RequestAccessScreen'
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
  if (access.status === 'allowed') {
    const ownerAccess =
      access.isOwner && access.pendingCount !== undefined
        ? { pendingCount: access.pendingCount }
        : undefined
    return <ExpensesApp source={source} accountEmail={access.email} {...(ownerAccess ? { ownerAccess } : {})} />
  }
  return (
    <RequestAccessScreen
      email={access.email}
      initialAccess={{
        status: access.status,
        ...(access.requestedAt ? { requestedAt: access.requestedAt } : {}),
      }}
    />
  )
}
