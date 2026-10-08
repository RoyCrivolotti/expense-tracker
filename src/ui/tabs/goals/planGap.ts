/**
 * How far ahead of or behind the plan a balance is, for the snapshot and the dashboard badge.
 * Past two years a count of months stops being useful ("85 months behind"), so it turns into
 * whole years.
 */
export function planGapLabel(months: number): string {
  const abs = Math.abs(months)
  const direction = months >= 0 ? 'ahead' : 'behind'
  if (abs < 24) return `${abs} month${abs !== 1 ? 's' : ''} ${direction}`
  return `more than ${Math.floor(abs / 12)} years ${direction}`
}
