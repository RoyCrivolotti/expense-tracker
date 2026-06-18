import { useMemo } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import { computeMonthlyTotals, formatCents, fullMonthLabel } from '../../../engine'
import styles from './mobile.module.css'

function valueColor(cents: number, type: 'income' | 'expense' | 'signed' | 'neutral'): string {
  if (type === 'income') return 'var(--exp-income)'
  if (type === 'expense') return ''
  if (type === 'signed')
    return cents > 0 ? 'var(--exp-income)' : cents < 0 ? 'var(--exp-expense)' : ''
  return ''
}

export function MonthlyTotalsMobile({ model }: { model: ExpenseModel }) {
  const rows = useMemo(
    () =>
      [...computeMonthlyTotals(model.dataset.transactions).values()].sort((a, b) =>
        b.month.localeCompare(a.month),
      ),
    [model.dataset],
  )

  return (
    <div className={styles.section}>
      <p className={styles.hint}>Posted income, expenses, saving, and investments per month.</p>
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
  const display = cents === 0 ? '—' : formatCents(cents, false)
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue} style={color ? { color } : undefined}>
        {display}
      </span>
    </div>
  )
}
