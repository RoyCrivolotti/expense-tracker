import type { ExpenseDataset } from '../../types'
import { latestCheckin } from '../../engine'

const DAY_MS = 86_400_000

/** Days since the latest check-in, or null with none yet. */
export function daysSinceCheckin(dataset: ExpenseDataset, today = new Date()): number | null {
  const latest = latestCheckin(dataset.wealthCheckins)
  if (!latest) return null
  const [y, m, d] = latest.checkinDate.split('-').map(Number) as [number, number, number]
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.floor((todayUtc - Date.UTC(y, m - 1, d)) / DAY_MS))
}
