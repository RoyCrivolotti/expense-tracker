import { HttpError } from '../http'
import type { KeyForId } from './accessJwt'

/** How long the team's keys are kept before they are fetched again. Access rotates its keys every few weeks. */
const TTL_MS = 60 * 60 * 1000
/** A token naming a key that is not held may mean a rotation, so the keys are fetched again, but not more often than this. */
const REFETCH_MIN_MS = 60 * 1000

interface Held {
  keys: Map<string, CryptoKey>
  fetchedAt: number
}

interface Options {
  fetch?: typeof fetch
  now?: () => number
}

interface Jwk {
  kid?: unknown
  kty?: unknown
  n?: unknown
  e?: unknown
}

/** `<team>.cloudflareaccess.com`, from what an operator is likely to paste: no scheme, no path, lowercase. */
export function normalizeTeamDomain(raw: string): string | null {
  const host = raw.trim().replace(/^https:\/\//i, '').replace(/\/+$/, '').toLowerCase()
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null
}

async function importKey(jwk: Jwk): Promise<CryptoKey | null> {
  if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') return null
  try {
    return await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  } catch {
    return null
  }
}

async function fetchKeys(teamDomain: string, doFetch: typeof fetch): Promise<Map<string, CryptoKey>> {
  const response = await doFetch(`https://${teamDomain}/cdn-cgi/access/certs`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`certs answered ${response.status}`)
  const body = await response.json<{ keys?: Jwk[] }>()
  const keys = new Map<string, CryptoKey>()
  for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
    const key = typeof jwk.kid === 'string' ? await importKey(jwk) : null
    if (key && typeof jwk.kid === 'string') keys.set(jwk.kid, key)
  }
  if (keys.size === 0) throw new Error('certs held no usable key')
  return keys
}

/**
 * The team's signing keys, kept in memory per isolate. They are fetched when none are held or they are older than
 * `TTL_MS`, and again when a token names a key that is not held (at most once a minute), by one request however many
 * are waiting. If a fetch fails, keys already held go on being used rather than refusing everyone; with none held the
 * request is a 503, since an identity that cannot be checked is not let through.
 */
export function createAccessKeyCache(options: Options = {}): KeyForId & { clear(): void } {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))
  const now = options.now ?? Date.now
  const held = new Map<string, Held>()
  const loading = new Map<string, Promise<Held>>()

  async function load(teamDomain: string): Promise<Held> {
    const pending = loading.get(teamDomain)
    if (pending) return pending
    const started = (async (): Promise<Held> => {
      const fresh: Held = { keys: await fetchKeys(teamDomain, doFetch), fetchedAt: now() }
      held.set(teamDomain, fresh)
      return fresh
    })().finally(() => loading.delete(teamDomain))
    loading.set(teamDomain, started)
    return started
  }

  const keyFor: KeyForId = async (teamDomain, keyId) => {
    const current = held.get(teamDomain)
    const age = current ? now() - current.fetchedAt : Infinity
    if (current && age < TTL_MS) {
      const key = current.keys.get(keyId)
      if (key || age < REFETCH_MIN_MS) return key ?? null
    }
    try {
      return (await load(teamDomain)).keys.get(keyId) ?? null
    } catch (error) {
      console.error('access: the team keys could not be fetched', error)
      if (current) return current.keys.get(keyId) ?? null
      throw new HttpError(503, 'Cannot check the sign-in right now')
    }
  }
  return Object.assign(keyFor, {
    clear() {
      held.clear()
      loading.clear()
    },
  })
}

/** The cache the middleware uses. */
export const accessKeys = createAccessKeyCache()
