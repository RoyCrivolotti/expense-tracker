import { PUSH_MODES, type PushMode } from '../ports/pushRepository'

/**
 * The push services a subscription may point at. The server will POST to whatever endpoint is stored, so the host is
 * closed to the services browsers actually use: Apple (Safari and Home Screen web apps), Google (Chrome and the
 * browsers built on it), Mozilla and Microsoft. Anything else is refused before it is stored.
 */
export const PUSH_SERVICE_HOSTS: readonly string[] = [
  'web.push.apple.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
]
export const PUSH_SERVICE_HOST_SUFFIXES: readonly string[] = ['.notify.windows.com']
export const MAX_ENDPOINT_LENGTH = 1024

const BASE64URL = /^[A-Za-z0-9_-]+$/
/** An uncompressed P-256 point is 65 bytes, which base64url writes in 87 characters, the first always `B` (the 0x04 tag). */
const P256DH_LENGTH = 87
/** The auth secret is 16 bytes: 22 characters. */
const AUTH_LENGTH = 22
export const MAX_TIME_ZONE_LENGTH = 64

/**
 * The endpoint as the sender will use it: an https URL on one of the push services, on the default port, with nothing
 * else in it, written the way the URL parser writes it (host in lower case, no surrounding whitespace), so one device
 * is one row however its browser spelt it. Null for anything else.
 */
export function pushServiceEndpointOf(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT_LENGTH) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '' || url.hash !== '')
    return null
  const host = url.hostname
  const known =
    PUSH_SERVICE_HOSTS.includes(host) ||
    PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
  return known ? url.href : null
}

/** The browser's base64url, with any `=` padding dropped, when it is exactly `length` characters long. */
function base64urlOfLength(
  value: unknown,
  length: number,
): string | null {
  if (typeof value !== 'string') return null
  const bare = value.replace(/=+$/, '')
  return bare.length === length && BASE64URL.test(bare) ? bare : null
}

export const p256dhOf = (value: unknown): string | null => {
  const key = base64urlOfLength(value, P256DH_LENGTH)
  return key !== null && key.startsWith('B') ? key : null
}

export const authSecretOf = (value: unknown): string | null => base64urlOfLength(value, AUTH_LENGTH)

export function isPushMode(value: unknown): value is PushMode {
  return typeof value === 'string' && (PUSH_MODES as readonly string[]).includes(value)
}

/** A zone name `Intl` accepts, which the browser's own report always is. Kept as given: `Intl` reads it later too. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value === '' || value.length > MAX_TIME_ZONE_LENGTH) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}
