import type { WealthAccount, WealthCheckin } from '../types'
import { shiftBudgetMonth } from '../engine'
import { todayIso } from '../ui/components/transactionFormState'

/**
 * Two accounts and three check-ins for README / docs screenshots (DOCS_CAPTURE only), so
 * Progress has a status, a net worth line and a history to show. Dated relative to today
 * and after the seeded plan's start, which is six months back.
 */
export function docsCaptureWealthAccounts(): WealthAccount[] {
  return [
    { id: 1, name: 'Broker', kind: 'investment', sortOrder: 0, archived: false },
    { id: 2, name: 'Savings', kind: 'cash', sortOrder: 1, archived: false },
  ]
}

export function docsCaptureWealthCheckins(): WealthCheckin[] {
  const today = todayIso()
  const month = today.slice(0, 7)
  const rows: [string, number, number][] = [
    [`${shiftBudgetMonth(month, -5)}-15`, 1_004_000_00, 24_000_00],
    [`${shiftBudgetMonth(month, -3)}-15`, 1_019_500_00, 19_000_00],
    [today, 1_036_000_00, 26_000_00],
  ]
  return rows.map(([checkinDate, broker, savings], index) => ({
    id: index + 1,
    checkinDate,
    createdAt: `${checkinDate}T09:00:00.000Z`,
    entries: [
      { accountId: 1, valueCents: broker },
      { accountId: 2, valueCents: savings },
    ],
  }))
}
