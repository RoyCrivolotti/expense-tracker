import type { RawPush } from './types'

/**
 * Identifies one push so that posting it twice changes nothing. Notifications carry no id, so the
 * source, Date, Title and Body together are the identity. Text alone is never enough: two denials
 * 55 seconds apart are two retries. Fields are length-prefixed so no value can imitate a separator.
 * The result is an unsalted SHA-256 digest: it does not show the text on inspection, but a body
 * built from a template (a one-time code) can be guessed and hashed again by anyone who can read
 * the stored key. Whatever stores it should key the digest with a secret (HMAC) first.
 */
export async function replayKey(push: RawPush): Promise<string> {
  const joined = [push.source, push.date, push.title, push.body].map((f) => `${f.length}:${f}`).join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(joined))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
