/**
 * How far ahead of or behind the plan a balance is, for the snapshot and the dashboard badge.
 * Past two years a count of months stops being useful ("85 months behind"), so it turns into
 * whole years, "more than" them unless the months are exactly that many years.
 */
export function planGapLabel(months: number): string {
  const abs = Math.abs(months)
  const direction = months >= 0 ? 'ahead' : 'behind'
  if (abs < 24) return `${abs} month${abs !== 1 ? 's' : ''} ${direction}`
  const more = abs % 12 === 0 ? '' : 'more than '
  return `${more}${Math.floor(abs / 12)} years ${direction}`
}
