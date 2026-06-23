import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import { computeCashReconciliation, formatCents } from '../../engine'
import { Money } from './Money'
import { Card, Pill, SectionTitle } from './primitives'
import styles from './CardStatementsCard.module.css'

interface CardStatementsCardProps {
  dataset: ExpenseDataset
  month: string
}

interface Statement {
  id: number
  name: string
  chargeCents: number
  paid: boolean
}

export function CardStatementsCard({ dataset, month }: CardStatementsCardProps) {
  const statements = useMemo<Statement[]>(() => {
    const rows = computeCashReconciliation(
      dataset.transactions,
      dataset.accounts,
      dataset.settings,
      dataset.cashActuals,
    )
    const row = rows.find((r) => r.month === month)
    if (!row) return []
    const names = new Map(dataset.accounts.map((a) => [a.id, a.name]))
    return [...row.cardCharges.entries()]
      .filter(([, card]) => card.chargeCents !== 0)
      .map(([id, card]) => ({
        id,
        name: names.get(id) ?? 'Card',
        chargeCents: card.chargeCents,
        paid: card.paid,
      }))
  }, [dataset, month])

  if (statements.length === 0) return null

  const unpaidTotal = statements
    .filter((s) => !s.paid)
    .reduce((sum, s) => sum + s.chargeCents, 0)

  return (
    <>
      <SectionTitle>Card statements</SectionTitle>
      <Card>
        {statements.map((s) => (
          <div key={s.id} className={styles.row}>
            <span className={styles.name}>{s.name}</span>
            <span className={styles.right}>
              <Money cents={s.chargeCents} />
              <Pill tone={s.paid ? 'success' : 'warning'}>{s.paid ? 'Paid' : 'Due'}</Pill>
            </span>
          </div>
        ))}
        <p className={styles.caption}>
          Deferred cards settle around the 12th–15th.{' '}
          {unpaidTotal !== 0
            ? `${formatCents(unpaidTotal)} still due this month.`
            : 'All settled this month.'}
        </p>
      </Card>
    </>
  )
}
