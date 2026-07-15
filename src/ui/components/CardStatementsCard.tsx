import { useMemo, useState } from 'react'
import type { ExpenseDataset } from '../../types'
import type { ExpenseActions } from '../actions'
import { computeCashReconciliation, formatCents } from '../../engine'
import { isStatementPaid } from '../../engine/status'
import { Money } from './Money'
import { StatementPaidToggle } from './StatementPaidToggle'
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

    return deferred.map((account) => {
      const card = row?.cardCharges.get(account.id)
      return {
        id: account.id,
        name: account.name,
        chargeCents: card?.chargeCents ?? 0,
        paid: isStatementPaid(dataset.accountStatements, account.id, month),
      }
    })
  }, [dataset, month])

  if (statements.length === 0) return null

  const unpaidTotal = statements
    .filter((s) => !s.paid)
    .reduce((sum, s) => sum + s.chargeCents, 0)

  const toggle = actions?.setStatementPaid
    ? async (accountId: number, paid: boolean) => {
        const key = `${accountId}:${month}`
        setPending(key)
        try {
          await actions.setStatementPaid(accountId, month, paid)
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
              <span className={styles.name}>{s.name}</span>
              <span className={styles.right}>
                <Money cents={s.chargeCents} />
                <StatementPaidToggle
                  paid={s.paid}
                  disabled={pending === key}
                  onToggle={
                    toggle ? () => void toggle(s.id, !s.paid) : undefined
                  }
                />
              </span>
            </div>
          )
        })}
        <p className={styles.caption}>
          Deferred cards settle around the 12th–15th. Mark Paid to show the debit
          payment in Transactions.{' '}
          {unpaidTotal !== 0
            ? `${formatCents(unpaidTotal)} still due this month.`
            : 'All settled this month.'}
        </p>
      </Card>
    </>
  )
}
