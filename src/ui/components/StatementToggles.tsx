import { useState } from 'react'
import { fullMonthLabel } from '../../engine/dates'
import { isStatementPaid } from '../../engine/status'
import type { ExpenseModel } from '../useExpenseData'
import { StatementPaidToggle } from './StatementPaidToggle'
import styles from './StatementToggles.module.css'

interface Props {
  model: ExpenseModel
  onToggle: (accountId: number, yearMonth: string, paid: boolean) => Promise<void>
}

export function StatementToggles({ model, onToggle }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const deferred = model.dataset.accounts.filter((a) => a.settlement === 'deferred')
  const months = [...model.months].reverse()

  const toggle = async (accountId: number, yearMonth: string, next: boolean) => {
    const key = `${accountId}:${yearMonth}`
    setPending(key)
    try {
      await onToggle(accountId, yearMonth, next)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className={styles.wrap}>
      {deferred.map((account) => (
        <div key={account.id} className={styles.account}>
          <div className={styles.accountName}>{account.name}</div>
          <div className={styles.months}>
            {months.map((m) => {
              const paid = isStatementPaid(model.dataset.accountStatements, account.id, m)
              const key = `${account.id}:${m}`
              return (
                <button
                  key={m}
                  type="button"
                  className={`${styles.chip} ${paid ? styles.paid : ''}`}
                  disabled={pending === key}
                  onClick={() => void toggle(account.id, m, !paid)}
                >
                  {fullMonthLabel(m)}
                  <StatementPaidToggle paid={paid} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
