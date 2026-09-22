/** Average monthly net saving across the months that have any posted activity. */
export function averageMonthlySaving(netSavingByMonth: number[]): number {
  if (netSavingByMonth.length === 0) return 0
  const total = netSavingByMonth.reduce((sum, v) => sum + v, 0)
  return Math.round(total / netSavingByMonth.length)
}
