/**
 * The ahead/behind gap in contribution time, for the snapshot and the dashboard badge.
 * Past two years the month count stops meaning anything ("360 months behind" is the
 * engine's horizon clamp, not a fact), so it turns into "more than N years".
 */
export function contributionGapLabel(deltaMonths: number): string {
  const abs = Math.abs(deltaMonths)
  const direction = deltaMonths >= 0 ? 'ahead' : 'behind'
  if (abs < 24) return `${abs} month${abs !== 1 ? 's' : ''} ${direction}`
  return `more than ${Math.floor(abs / 12)} years ${direction}`
}
