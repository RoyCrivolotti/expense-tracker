import type { StatementRow } from './cardStatementRows'
import { StatementSummaryRow } from './StatementSummaryRow'
import styles from './CardStatementsCard.module.css'

interface Props {
  statements: StatementRow[]
  canSave: boolean
  pending: ReadonlySet<number>
  markPaidToday: ((row: StatementRow) => Promise<void>) | undefined
  onOpen: (id: number) => void
}

export function StatementList({ statements, canSave, pending, markPaidToday, onOpen }: Props) {
  return (
    <div className={styles.list}>
      {statements.map((s) => {
        const actionable = canSave && s.chargeCents !== 0
        return (
          <StatementSummaryRow
            key={s.id}
            name={s.name}
            amountCents={s.chargeCents}
            paid={s.paid}
            paidOn={s.paidOn}
            disabled={pending.has(s.id)}
            {...(actionable ? { onPress: () => onOpen(s.id) } : {})}
            {...(actionable && !s.paid && markPaidToday ? { onMarkPaidToday: () => void markPaidToday(s) } : {})}
          />
        )
      })}
    </div>
  )
}
