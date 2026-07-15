import { useMemo, useState } from 'react'
import type { ExpenseDataset } from '../../types'
import type { ExpenseActions } from '../actions'
import { computeCashReconciliation, formatCents } from '../../engine'
import { isStatementPaid } from '../../engine/status'
import { todayLocalIso } from '../dates'
import { Money } from './Money'
import { StatementPaidDate } from './StatementPaidDate'
import { Card, SectionTitle } from './primitives'
import styles from './CardStatementsCard.module.css'

interface CardStatementsCardProps {
  dataset: ExpenseDataset
  month: string
  actions?: ExpenseActions | undefined
}

interface StatementRow {
  id: number
  name: string
  chargeCents: number
  paid: boolean
  paidOn?: string | undefined
}

function findPaidOn(
  statements: ExpenseDataset['accountStatements'],
  accountId: number,
  yearMonth: string,
): string | undefined {
  return statements.find((s) => s.accountId === accountId && s.yearMonth === yearMonth)?.paidOn
}

export function CardStatementsCard({ dataset, month, actions }: CardStatementsCardProps) {
  const [pending, setPending] = useState<string | null>(null)

  const statements = useMemo<StatementRow[]>(() => {
    const deferred = dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active)
    if (deferred.length === 0) return []

    const rows = computeCashReconciliation(
      dataset.transactions,
      dataset.accounts,
      dataset.settings,
      dataset.cashActuals,
    )
    const row = rows.find((r) => r.month === month)

    return deferred.map((account) => ({
      id: account.id,
      name: account.name,
      chargeCents: row?.cardCharges.get(account.id)?.chargeCents ?? 0,
      paid: isStatementPaid(dataset.accountStatements, account.id, month),
      paidOn: findPaidOn(dataset.accountStatements, account.id, month),
    }))
  }, [dataset, month])

  if (statements.length === 0) return null

  const unpaidTotal = statements
    .filter((s) => !s.paid)
    .reduce((sum, s) => sum + s.chargeCents, 0)

  const savePaid = actions?.setStatementPaid
    ? async (accountId: number, paid: boolean, paidOn?: string) => {
        const key = `${accountId}:${month}`
        setPending(key)
        try {
          await actions.setStatementPaid(
            accountId,
            month,
            paid,
            paid ? (paidOn ?? todayLocalIso()) : undefined,
          )
        } finally {
          setPending(null)
        }
      }
    : undefined

  return (
    <>
      <SectionTitle>Card statements</SectionTitle>
      <Card>
        {statements.map((s) => {
          const key = `${s.id}:${month}`
          return (
            <div key={s.id} className={styles.row}>
              <div className={styles.summary}>
                <span className={styles.name}>{s.name}</span>
                <Money cents={s.chargeCents} />
              </div>
              {savePaid && (
                <StatementPaidDate
                  paid={s.paid}
                  paidOn={s.paidOn}
                  disabled={pending === key}
                  onMarkPaid={(paidOn) => void savePaid(s.id, true, paidOn)}
                  onEditDate={(paidOn) => void savePaid(s.id, true, paidOn)}
                  onMarkDue={() => void savePaid(s.id, false)}
                />
              )}
            </div>
          )
        })}
        <p className={styles.caption}>
          Deferred cards settle around the 12th–15th. Set the paid date to place the debit
          in Transactions on that calendar day.{' '}
          {unpaidTotal !== 0
            ? `${formatCents(unpaidTotal)} still due this month.`
            : 'All settled this month.'}
        </p>
      </Card>
    </>
  )
}
