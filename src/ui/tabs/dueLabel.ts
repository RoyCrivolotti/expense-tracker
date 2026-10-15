import { daysBetween } from '../../engine'

/** How many days from `today` a charge is due: negative once its date has passed. */
export function daysUntilDue(predictedDate: string, today: string): number {
  return daysBetween(today, predictedDate)
}

/** A charge's date said against today: "Due today", "Due tomorrow", "Due in 3 days", "Due yesterday", "Due 2 days ago". */
export function dueLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil > 1) return `Due in ${daysUntil} days`
  if (daysUntil === -1) return 'Due yesterday'
  return `Due ${-daysUntil} days ago`
}
