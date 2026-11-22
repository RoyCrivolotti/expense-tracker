import type { PushSettings } from '../../../src/domain/ports/pushRepository'

/** The local hour a summary becomes due. */
export const SUMMARY_HOUR = 20
/** Monday, as `Date#getDay` counts (Sunday is 0). */
const WEEKLY_DAY = 1

export interface LocalTime {
  /** `YYYY-MM-DD` on the person's own calendar. */
  date: string
  hour: number
  /** 0 is Sunday. */
  weekday: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * What the clock and calendar say in a zone at an instant, or null for a zone the platform does not know, or an
 * instant that is not a date. The zone's own rules do the work, so summer time needs no handling here.
 */
export function localTime(
  at: Date,
  zone: string,
): LocalTime | null {
  if (Number.isNaN(at.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      weekday: 'short',
    }).formatToParts(at)
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')),
      weekday: WEEKDAYS.indexOf(get('weekday')),
    }
  } catch {
    return null
  }
}

export type SummaryState =
  /** Send one now. */
  | 'due'
  /** Not yet the person's evening, or not their weekday. */
  | 'not-yet'
  /** This evening's summary already went. */
  | 'sent'
  | 'invalid-zone'

/**
 * Whether a person's summary is due at `now`. It is due from 20:00 in their zone to midnight, on every day for `daily`
 * and on Monday for `weekly`, until one is recorded for that local date. So a cron run an hour or three late still
 * sends, and two runs in the same evening send once. A run that comes after midnight is a different day and sends
 * nothing for the evening it missed. The cron runs on the hour, so a zone whose clock sits at a half hour is reached
 * at 20:30.
 */
export function summaryState(
  person: Pick<PushSettings, 'mode' | 'timeZone' | 'lastSummaryAt'>,
  now: Date,
): SummaryState {
  const local = localTime(now, person.timeZone)
  if (!local) return 'invalid-zone'
  if (person.mode === 'each') return 'not-yet'
  if (local.hour < SUMMARY_HOUR) return 'not-yet'
  if (person.mode === 'weekly' && local.weekday !== WEEKLY_DAY) return 'not-yet'
  if (person.lastSummaryAt) {
    const last = localTime(new Date(person.lastSummaryAt), person.timeZone)
    if (last && last.date >= local.date) return 'sent'
  }
  return 'due'
}
