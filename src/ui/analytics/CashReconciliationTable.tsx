import type { ExpenseModel } from '../useExpenseData'
import type { CashRow } from '../../engine'
import { computeCashReconciliation, fullMonthLabel } from '../../engine'
import { ActualCashCell } from './ActualCashCell'
import { gapCellClass, money, moneyAlways, sum } from './cells'
import styles from './analytics.module.css'

interface Props {
  model: ExpenseModel
  onSetCashActual?: (yearMonth: string, actualCashCents: number | null) => Promise<void>
}

function shortAccountLabel(name: string): string {
  const first = name.split(/\s+/)[0] ?? name
  return first.length <= 12 ? first : `${first.slice(0, 10)}…`
}

function CashReconRow({
  row,
  cardIds,
  onSetCashActual,
}: {
  row: CashRow
  cardIds: number[]
  onSetCashActual: Props['onSetCashActual']
}) {
  return (
    <tr>
      <td>{fullMonthLabel(row.month)}</td>
      <td className={styles.pos}>{money(row.incomeCents)}</td>
      <td>{money(row.debitExpenseCents)}</td>
      {cardIds.map((id) => {
        const card = row.cardCharges.get(id)
        return (
          <td key={id} className={card && !card.paid ? styles.warn : undefined}>
            {money(card?.chargeCents ?? 0)}
          </td>
        )
      })}
      <td>{money(row.investmentsCents)}</td>
      <td className={row.cashMovementCents < 0 ? styles.neg : styles.pos}>
        {moneyAlways(row.cashMovementCents)}
      </td>
      <td>{moneyAlways(row.expectedCashCents)}</td>
      <td>
        <ActualCashCell
          month={row.month}
          valueCents={row.actualCashCents}
          onSave={onSetCashActual}
        />
      </td>
      <td className={gapCellClass(row.carryoverGapCents, styles.over)}>
        {row.carryoverGapCents === null ? '—' : moneyAlways(row.carryoverGapCents)}
      </td>
      <td className={gapCellClass(row.monthGapCents, styles.over)}>
        {row.monthGapCents === null ? '—' : moneyAlways(row.monthGapCents)}
      </td>
      <td className={gapCellClass(row.gapCents, styles.over)}>
        {row.gapCents === null ? '—' : moneyAlways(row.gapCents)}
      </td>
      <td className={row.unpaidLiabilityCents !== 0 ? styles.warn : undefined}>
        {money(row.unpaidLiabilityCents)}
      </td>
    </tr>
  )
}

function TotalsRow({ rows, cardIds }: { rows: CashRow[]; cardIds: number[] }) {
  return (
    <tr className={styles.totalRow}>
      <td>Total</td>
      <td>{money(sum(rows, (r) => r.incomeCents))}</td>
      <td>{money(sum(rows, (r) => r.debitExpenseCents))}</td>
      {cardIds.map((id) => (
        <td key={id}>{money(sum(rows, (r) => r.cardCharges.get(id)?.chargeCents ?? 0))}</td>
      ))}
      <td>{money(sum(rows, (r) => r.investmentsCents))}</td>
      <td>{moneyAlways(sum(rows, (r) => r.cashMovementCents))}</td>
      <td />
      <td />
      <td />
      <td />
      <td />
      <td>{money(sum(rows, (r) => r.unpaidLiabilityCents))}</td>
    </tr>
  )
}

export function CashReconciliationTable({ model, onSetCashActual }: Props) {
  const { dataset } = model
  const cards = dataset.accounts.filter((a) => a.settlement === 'deferred')
  const cardIds = cards.map((c) => c.id)
  const rows = computeCashReconciliation(
    dataset.transactions,
    dataset.accounts,
    dataset.settings,
    dataset.cashActuals,
  )
  if (rows.length === 0) return null

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Debit</th>
            {cards.map((c) => (
              <th key={c.id} title={c.name}>
                {shortAccountLabel(c.name)}
              </th>
            ))}
            <th>Invested</th>
            <th>Cash Δ</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Carryover</th>
            <th>This month</th>
            <th>Total gap</th>
            <th>Unpaid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <CashReconRow
              key={r.month}
              row={r}
              cardIds={cardIds}
              onSetCashActual={onSetCashActual}
            />
          ))}
          <TotalsRow rows={rows} cardIds={cardIds} />
        </tbody>
      </table>
    </div>
  )
}
