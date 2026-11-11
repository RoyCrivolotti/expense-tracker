import type { RawPush } from './types'

/**
 * Identifies one push so that posting it twice changes nothing. Notifications carry no id, so the
 * source, Date, Title and Body together are the identity. Text alone is never enough: two denials
 * 55 seconds apart are two retries. Fields are length-prefixed so no value can imitate a separator.
 */
export function replayKey(push: RawPush): string {
  return [push.source, push.date, push.title, push.body].map((f) => `${f.length}:${f}`).join('|')
}
