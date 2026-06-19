import { useEffect, useState } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import { fetchAccessStatus, type AccessStatusResponse } from '../../data/accessApi'
import { ExpensesApp } from '../ExpensesApp'
import { ApproveAccessScreen } from './ApproveAccessScreen'
import { RequestAccessScreen } from './RequestAccessScreen'
import styles from '../ExpensesApp.module.css'

function approveTokenFromLocation(): string | null {
  if (!window.location.pathname.startsWith('/access/approve')) return null
  return new URL(window.location.search, window.location.origin).searchParams.get('token')
}

export function AccessGate({ source }: { source: ExpenseDataSource }) {
  const approveToken = approveTokenFromLocation()
  const [access, setAccess] = useState<AccessStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (approveToken) return
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
  }, [approveToken])

  if (approveToken) return <ApproveAccessScreen token={approveToken} />
  if (error) return <div className={styles.center}>Couldn&apos;t check access: {error}</div>
  if (!access) return <div className={styles.center}>Loading…</div>
  if (access.status === 'allowed') return <ExpensesApp source={source} />
  return (
    <RequestAccessScreen email={access.email} initialStatus={access.status === 'pending' ? 'pending' : 'none'} />
  )
}
