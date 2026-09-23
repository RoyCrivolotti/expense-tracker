import type { ExpenseDataset } from '../../types'
import { DAY_MS, latestCheckin, utcDateMs } from '../../engine'

/** Days since the latest check-in, or null with none yet. */
export function daysSinceCheckin(dataset: ExpenseDataset, today = new Date()): number | null {
  const latest = latestCheckin(dataset.wealthCheckins)
  if (!latest) return null
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.floor((todayUtc - utcDateMs(latest.checkinDate)) / DAY_MS))
}
