import { formatCents, type MoneyFormat } from '../../../engine'

/** The month after the one the plan starts in, which is the earliest a change can begin. */
export function firstMonthAfter(planStartDate: string): string {
  const [year = 0, month = 1] = planStartDate.split('-').map(Number)
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return `${next.year}-${String(next.month).padStart(2, '0')}`
}

/** An amount a month, or "pause" for none: nothing is sent, which is not the same as 0,00 € a month. */
export function amountLabel(
  cents: number,
  format: MoneyFormat,
): string {
  return cents === 0 ? 'pause' : `${formatCents(cents, format)}/mo`
}
