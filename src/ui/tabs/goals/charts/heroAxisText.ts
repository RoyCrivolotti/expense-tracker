import { yearLabel } from '../yearLabel'
import { sparseLabels } from '../../../charts/linearScale'

const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "Jul 2027": the month a scenario starts in, in the app's English (the money's locale is for figures, not words). */
export function monthYear(date: string): string {
  return MONTH_YEAR.format(new Date(`${date}T00:00:00Z`))
}

const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "11 Sept 2026": a day, in the app's English whatever the browser's language. */
export function dayMonthYear(date: string): string {
  return DAY_MONTH_YEAR.format(new Date(`${date}T00:00:00Z`))
}

/**
 * The bottom axis' labels. Plan years read 0, 5, 10 as they always have. On a calendar a year takes four
 * digits, so a phone labels every tenth year, and the last year drawn is labelled only when it is far
 * enough past the last label (three fifths of a step) not to run into it.
 */
export function axisLabels(
  years: number[],
  calendarOrigin: string | null,
  narrow: boolean,
): string[] {
  if (!calendarOrigin) return sparseLabels(years, 5)
  const step = narrow ? 10 : 5
  const last = years.length - 1
  const lastLabelled = last - (last % step)
  return years.map((y, i) => {
    const labelled = i % step === 0 || (i === last && last - lastLabelled >= step * 0.6)
    return labelled ? yearLabel(y, calendarOrigin) : ''
  })
}
