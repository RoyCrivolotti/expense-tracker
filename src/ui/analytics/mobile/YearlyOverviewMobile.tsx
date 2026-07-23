import { useMemo } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import { computeYearlyOverview, formatCents, fullMonthLabel } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './mobile.module.css'

export function YearlyOverviewMobile({ model }: { model: ExpenseModel }) {
  const rows = useMemo(
    () => computeYearlyOverview(model.dataset.transactions, model.dataset.settings),
    [model.dataset],
  )

  if (rows.length === 0) return null

  return (
    <div className={styles.section}>
      <p className={styles.hint}>Running balances — cash, investments, and net worth.</p>
      {rows.map((r) => (
        <div key={r.month} className={styles.monthCard}>
          <div className={styles.monthHeader}>{fullMonthLabel(r.month)}</div>
          <Row label="Income" cents={r.incomeCents} color="var(--exp-income)" />
          <Row
            label="Net saving"
            cents={r.netSavingCents}
            color={r.netSavingCents >= 0 ? 'var(--exp-income)' : 'var(--exp-expense)'}
          />
          <Row label="Expected cash" cents={r.expectedCashCents} alwaysShow />
          <Row label="Investments" cents={r.investmentBalanceCents} alwaysShow />
          <Row label="Net worth" cents={r.netWorthCents} alwaysShow bold />
        </div>
      ))}
    </div>
  )
}

function Row({
  label,
  cents,
  color,
  alwaysShow,
  bold,
}: {
  label: string
  cents: number
  color?: string
  alwaysShow?: boolean
  bold?: boolean
}) {
  const format = useMoneyFormat()
  const display = cents === 0 && !alwaysShow ? '—' : formatCents(cents, format, false)
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span
        className={styles.rowValue}
        style={{ ...(color ? { color } : {}), ...(bold ? { fontWeight: 700 } : {}) }}
      >
        {display}
      </span>
    </div>
  )
}
