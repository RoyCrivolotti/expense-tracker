/** When a pushed payment happened on the phone's clock, and which days a bank might book it on. */

/** What the recommendation's two instants say about when the payment happened, in the phone's own clock. */
export interface PaymentClock {
  /** Minutes since the phone's midnight, or null when the phone's offset or day is unknown. */
  minuteOfDay: number | null
  /** `HH:MM` on the phone's clock, or null when unknown. */
  time: string | null
  /** The phone's calendar day the push reached the server on, or null when the offset is unknown. */
  arrivedDate: string | null
  /** `HH:MM` on the phone's clock when it did, or null. */
  arrivedTime: string | null
}

const WITH_OFFSET = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}(?:\.\d+)?([+-])(\d{2}):(\d{2})$/

/**
 * Reads the phone's own time of day from `occurredAt`, which the Worker writes with the phone's offset, never `Z`. A
 * row in UTC, or whose day is not `localDate`, has no known phone clock. Nothing here reads this device's zone, so a
 * device in another zone than the payment reads the same.
 */
export function paymentClock(
  occurredAt: string,
  localDate: string,
  createdAt: string,
): PaymentClock {
  const m = WITH_OFFSET.exec(occurredAt)
  if (!m || m[1] !== localDate) return { minuteOfDay: null, time: null, arrivedDate: null, arrivedTime: null }
  const offset = (m[4] === '-' ? -1 : 1) * (Number(m[5]) * 60 + Number(m[6]))
  const arrivedMs = Date.parse(createdAt)
  const arrived = Number.isNaN(arrivedMs) ? null : new Date(arrivedMs + offset * 60_000).toISOString()
  return {
    minuteOfDay: Number(m[2]) * 60 + Number(m[3]),
    time: `${m[2]}:${m[3]}`,
    arrivedDate: arrived?.slice(0, 10) ?? null,
    arrivedTime: arrived?.slice(11, 16) ?? null,
  }
}

/** How far either side of a payment's own time a bank may book it, in minutes. Pushes ran up to half an hour late. */
export const EDGE_MINUTES = 60

/** The calendar day `days` away from `iso`. */
export function shiftDay(
  iso: string,
  days: number,
): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Every day a bank might book the payment on: its own day, the day before or after when it is within `EDGE_MINUTES`
 * of midnight (both when its time is unknown), and the day its push arrived, since a late push is a late payment too.
 */
export function bookingDates(
  localDate: string,
  minuteOfDay: number | null,
  arrivedDate: string | null,
): string[] {
  const dates = new Set([localDate])
  if (minuteOfDay === null || minuteOfDay < EDGE_MINUTES) dates.add(shiftDay(localDate, -1))
  if (minuteOfDay === null || minuteOfDay >= 24 * 60 - EDGE_MINUTES) dates.add(shiftDay(localDate, 1))
  if (arrivedDate !== null) dates.add(arrivedDate)
  return [...dates]
}

/**
 * The days a payment might be booked on that fall in another budget month than its own day does. `monthOf` is the
 * rule the add form uses, so the calendar month end, the user's rollover day and a settled statement are all one
 * rule here: whatever moves the budget month moves it for a day an hour away too. Empty means the budget month is
 * the same whichever of those days the bank picks.
 */
export function otherBudgetDays(
  monthOf: (isoDate: string) => string,
  localDate: string,
  minuteOfDay: number | null,
  arrivedDate: string | null,
): string[] {
  const own = monthOf(localDate)
  return bookingDates(localDate, minuteOfDay, arrivedDate).filter((day) => day !== localDate && monthOf(day) !== own)
}
