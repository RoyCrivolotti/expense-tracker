import type { LifeEvent } from '../types'

/** More events than a plan can show legibly; no plan has this many. */
export const LIFE_EVENT_MAX_COUNT = 50
/** A plan runs a century at most, and an event is a year of it. */
const LIFE_EVENT_MAX_YEAR = 100
/** No balance, price or one-off amount is more than this, in cents; the same ceiling the number boxes hold to. */
const LIFE_EVENT_MAX_CENTS = 1e13
const LIFE_EVENT_LABEL_MAX_LENGTH = 100

/** One entry as a well-formed event, or why not. */
function validateEvent(entry: unknown): string | null {
  if (typeof entry !== 'object' || entry === null) return 'a life event must be an object with year, amountCents and label'
  const { year, amountCents, label } = entry as Record<string, unknown>
  if (!Number.isInteger(year) || (year as number) < 0 || (year as number) > LIFE_EVENT_MAX_YEAR) {
    return `a life event's year must be a whole number from 0 to ${LIFE_EVENT_MAX_YEAR}`
  }
  if (!Number.isSafeInteger(amountCents) || Math.abs(amountCents as number) > LIFE_EVENT_MAX_CENTS) {
    return "a life event's amountCents must be a whole number of cents, a hundred billion euros at most either way"
  }
  if (typeof label !== 'string' || label.length > LIFE_EVENT_LABEL_MAX_LENGTH) {
    return `a life event's label must be text of at most ${LIFE_EVENT_LABEL_MAX_LENGTH} characters`
  }
  return null
}

/**
 * Why a value is not a list of life events, or null when it is. What the server takes on a write: an entry that is
 * null or has a text amount reaches the Goals screen as a crash or NaN, and a stored row cannot be repaired from it.
 */
export function validateLifeEvents(value: unknown): string | null {
  if (!Array.isArray(value)) return 'lifeEvents must be an array'
  if (value.length > LIFE_EVENT_MAX_COUNT) return `lifeEvents must have at most ${LIFE_EVENT_MAX_COUNT} entries`
  for (const entry of value) {
    const problem = validateEvent(entry)
    if (problem) return problem
  }
  return null
}

/**
 * The stored column as a list of events. A value that is not a list reads as none, and an entry that is not an event is
 * left out on its own, so one bad entry in a row does not blank the plan it is saved in.
 */
export function lifeEventsFrom(value: unknown): LifeEvent[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => validateEvent(entry) === null)
    .slice(0, LIFE_EVENT_MAX_COUNT)
    .map((entry) => {
      const { year, amountCents, label } = entry as LifeEvent
      return { year, amountCents, label }
    })
}
