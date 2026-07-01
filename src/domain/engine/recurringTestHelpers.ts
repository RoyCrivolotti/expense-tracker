import type { Transaction } from '../types'

export function makeTxn(
  overrides: Partial<Transaction> & { date: string; description: string },
): Transaction {
  const base: Transaction = {
    id: Math.random() * 10000,
    date: overrides.date,
    budgetMonth: overrides.budgetMonth ?? overrides.date.slice(0, 7),
    description: overrides.description,
    accountId: overrides.accountId ?? 1,
    categoryId: overrides.categoryId ?? 1,
    type: overrides.type ?? 'expense',
    amountCents: overrides.amountCents ?? 1500,
    cancelled: overrides.cancelled ?? false,
    status: overrides.status ?? 'posted',
  }
  if (overrides.notes != null) base.notes = overrides.notes
  return base
}

export function monthlyDates(
  startYear: number,
  startMonth: number,
  day: number,
  count: number,
): string[] {
  const dates: string[] = []
  let y = startYear
  let m = startMonth
  for (let i = 0; i < count; i++) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return dates
}
