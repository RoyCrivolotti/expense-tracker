export interface DayCell {
  year: number
  month: number
  day: number
  /** True when this cell belongs to a different month than the one being viewed. */
  outside: boolean
}

/** Monday-first day-of-week index (0=Mon … 6=Sun). */
function mondayBasedDow(year: number, month: number, day: number): number {
  const jsDay = new Date(year, month - 1, day).getDay()
  return (jsDay + 6) % 7
}

/**
 * Build a 6-row × 7-column calendar grid (Monday-first) for the given
 * year/month. Every row has exactly 7 cells; leading/trailing days from
 * adjacent months have `outside: true`.
 */
export function buildCalendarGrid(year: number, month: number): DayCell[][] {
  const firstDow = mondayBasedDow(year, month, 1)
  const daysInMonth = new Date(year, month, 0).getDate()

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const daysInPrev = new Date(prevYear, prevMonth, 0).getDate()

  const cells: DayCell[] = []

  // Leading days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ year: prevYear, month: prevMonth, day: daysInPrev - i, outside: true })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ year, month, day: d, outside: false })
  }

  // Trailing days to fill 6 rows (42 cells)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  let trailing = 1
  while (cells.length < 42) {
    cells.push({ year: nextYear, month: nextMonth, day: trailing++, outside: true })
  }

  const rows: DayCell[][] = []
  for (let r = 0; r < 6; r++) {
    rows.push(cells.slice(r * 7, r * 7 + 7))
  }
  return rows
}

/** ISO date string from a DayCell. */
export function dayCellToIso(cell: DayCell): string {
  return `${cell.year}-${String(cell.month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
}
