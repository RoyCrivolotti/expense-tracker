import { dayMonthYear } from './charts/heroAxisText'

/** "11 Sept 2026" for a YYYY-MM-DD check-in date, in the app's English (the browser's language is not the app's). */
export const formatCheckinDate = dayMonthYear

/** What the Plan view needs from the latest check-in: the invested total and its date. */
export interface InvestedSnapshot {
  investedCents: number
  date: string
}
