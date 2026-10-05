import { useMemo } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { AnalyticsBasis } from '../../../engine'
import { basisOptions, computeMonthlyTotals, formatCents, fullMonthLabel } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './mobile.module.css'

function valueColor(cents: number, type: 'income' | 'expense' | 'signed' | 'neutral'): string {
  if (type === 'income') return 'var(--exp-income)'
  if (type === 'expense') return ''
  if (type === 'signed')
    return cents > 0 ? 'var(--exp-income)' : cents < 0 ? 'var(--exp-expense)' : ''
  return ''
}

const HINT: Record<AnalyticsBasis, string> = {
  committed:
    'Committed income, expenses, saving, and investments per month — unpaid card charges count in their budget month.',
  paid: 'Paid income, expenses, saving, and investments per month — unpaid card charges are left out.',
}

export function MonthlyTotalsMobile({
  model,
  basis = 'committed',
}: {
  model: ExpenseModel
  basis?: AnalyticsBasis
}) {
  const rows = useMemo(
    () =>
      [...computeMonthlyTotals(model.dataset.transactions, basisOptions(basis)).values()].sort(
        (a, b) => b.month.localeCompare(a.month),
      ),
    [model.dataset, basis],
  )

  return (
    <div className={styles.section}>
      <p className={styles.hint}>{HINT[basis]}</p>
      {rows.map((r) => (
        <div key={r.month} className={styles.monthCard}>
          <div className={styles.monthHeader}>{fullMonthLabel(r.month)}</div>
          <Row label="Income" cents={r.incomeCents} color={valueColor(r.incomeCents, 'income')} />
          <Row label="Expenses" cents={r.expensesCents} color="" />
          <Row
            label="Net saving"
            cents={r.netSavingCents}
            color={valueColor(r.netSavingCents, 'signed')}
          />
          <Row label="Invested" cents={r.investmentsCents} color="" />
        </div>
      ))}
    </div>
  )
}

function Row({ label, cents, color }: { label: string; cents: number; color: string }) {
  const format = useMoneyFormat()
  const display = cents === 0 ? '—' : formatCents(cents, format, false)
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue} style={color ? { color } : undefined}>
        {display}
      </span>
    </div>
  )
}
