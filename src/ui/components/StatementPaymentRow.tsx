import type { StatementPaymentRow as StatementPaymentRowData } from '../../engine'
import { fullMonthLabel } from '../../engine'
import { StatementSummaryRow } from './StatementSummaryRow'

interface Props {
  row: StatementPaymentRowData
  onPress?: () => void
}

export function StatementPaymentRow({ row, onPress }: Props) {
  return (
    <StatementSummaryRow
      name={`${row.cardName} statement`}
      subtitle={fullMonthLabel(row.budgetMonth)}
      amountCents={row.amountCents}
      paid
      paidOn={row.date}
      {...(onPress ? { onPress } : {})}
    />
  )
}
