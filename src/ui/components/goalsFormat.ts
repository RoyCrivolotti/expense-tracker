/** Human-readable goal timeline labels. */
export function formatMonths(n: number): string {
  if (n === 0) return 'Reached'
  if (!Number.isFinite(n)) return '—'
  return n === 1 ? '1 month' : `${n} months`
}

export function formatYears(n: number): string {
  if (n === 0) return 'Reached'
  if (!Number.isFinite(n)) return '—'
  if (n < 1) return '< 1 year'
  return `${n.toFixed(1)} years`
}
