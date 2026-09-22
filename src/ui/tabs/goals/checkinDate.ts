/** "11 Sep 2026" for a YYYY-MM-DD check-in date, in the viewer's locale. */
export function formatCheckinDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** What the Plan view needs from the latest check-in: the invested total and its date. */
export interface InvestedSnapshot {
  investedCents: number
  date: string
}
