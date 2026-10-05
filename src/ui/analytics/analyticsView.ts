/** The three Analytics views. Overview answers "how am I doing", Spending "where does it go", Cash "do my numbers match". */
export type AnalyticsView = 'overview' | 'spending' | 'cash'

export const ANALYTICS_VIEWS: { value: AnalyticsView; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'spending', label: 'Spending' },
  { value: 'cash', label: 'Cash' },
]
