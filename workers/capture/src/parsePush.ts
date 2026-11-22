import { MAX_APP_NAME_LENGTH, isSourceWord, sourceWordOf, type RawPush } from '../../../src/domain/capture'
import { MAX_BODY_TEXT_LENGTH, MAX_DATE_LENGTH, MAX_TITLE_LENGTH } from './limits'

/**
 * The push in a request body, or null when it is not JSON or any field is missing, not text or too long. Only these
 * five fields are read. Anything else the phone sends is ignored and never stored.
 *
 * The source is the `source` word when the body has a valid one, so a shortcut set up with a typed word keeps the
 * identity its payments and cards are filed under. Otherwise it is the notification's App name, `app`, folded into a
 * word (`sourceWordOf`), which is what a shortcut sends without anything typed by hand.
 */
export function parsePush(text: string): RawPush | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { source, app, title, body, date } = value as Record<string, unknown>
  const word = isSourceWord(source) ? source : isText(app, MAX_APP_NAME_LENGTH) ? sourceWordOf(app) : null
  if (word === null) return null
  if (!isText(title, MAX_TITLE_LENGTH) || !isText(body, MAX_BODY_TEXT_LENGTH) || !isText(date, MAX_DATE_LENGTH))
    return null
  return { source: word, title, body, date }
}

function isText(
  value: unknown,
  max: number,
): value is string {
  return typeof value === 'string' && value.length <= max
}
