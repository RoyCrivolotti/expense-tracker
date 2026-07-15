import { useState } from 'react'
import { fullMonthLabel } from '../../engine/dates'
import { isStatementPaid } from '../../engine/status'
import { todayLocalIso } from '../dates'
import type { ExpenseModel } from '../useExpenseData'
import { StatementPaidDate } from './StatementPaidDate'
import styles from './StatementToggles.module.css'

interface Props {
  model: ExpenseModel
  onToggle: (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => Promise<void>
}

function findPaidOn(
  model: ExpenseModel,
  accountId: number,
  yearMonth: string,
): string | undefined {
  return model.dataset.accountStatements.find(
    (s) => s.accountId === accountId && s.yearMonth === yearMonth,
  )?.paidOn
}

export function StatementToggles({ model, onToggle }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const deferred = model.dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active)
  const months = [...model.months].reverse()

  const save = async (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => {
    const key = `${accountId}:${yearMonth}`
    setPending(key)
    try {
      await onToggle(accountId, yearMonth, paid, paid ? (paidOn ?? todayLocalIso()) : undefined)
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
                <div key={m} className={styles.monthRow}>
                  <span className={styles.monthLabel}>{fullMonthLabel(m)}</span>
                  <StatementPaidDate
                    paid={paid}
                    paidOn={findPaidOn(model, account.id, m)}
                    disabled={pending === key}
                    onMarkPaid={(paidOn) => void save(account.id, m, true, paidOn)}
                    onEditDate={(paidOn) => void save(account.id, m, true, paidOn)}
                    onMarkDue={() => void save(account.id, m, false)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
