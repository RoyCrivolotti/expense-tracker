import type { RawPush } from '../../../src/domain/capture'
import { MAX_BODY_TEXT_LENGTH, MAX_DATE_LENGTH, MAX_TITLE_LENGTH } from './limits'

const SOURCES: readonly string[] = ['iberia', 'santander']

/**
 * The push in a request body, or null when it is not JSON or any field is missing, not text or too long. Only these
 * four fields are read. Anything else the phone sends is ignored and never stored.
 */
export function parsePush(text: string): RawPush | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { source, title, body, date } = value as Record<string, unknown>
  if (typeof source !== 'string' || !SOURCES.includes(source)) return null
  if (!isText(title, MAX_TITLE_LENGTH) || !isText(body, MAX_BODY_TEXT_LENGTH) || !isText(date, MAX_DATE_LENGTH)) return null
  return { source: source as RawPush['source'], title, body, date }
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}
