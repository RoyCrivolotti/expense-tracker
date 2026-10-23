/**
 * A stand-in for Cloudflare Access's signing side, for tests: a generated RSA key that signs tokens the way Access
 * does, the certs document that publishes its public half, and a `fetch` that serves that document and counts its calls.
 */
export const TEAM = 'acme.cloudflareaccess.com'
export const AUD = 'a1b2c3d4e5f6'.repeat(5)

export interface Idp {
  kid: string
  keyPair: CryptoKeyPair
  /** The certs document: `{ keys: [...] }`. */
  certs(): Promise<{ keys: Array<Record<string, unknown>> }>
  /** Signs `claims` with this key, or with `options.key`, as an RS256 token. */
  sign(claims: Record<string, unknown>, options?: SignOptions): Promise<string>
}

export interface SignOptions {
  /** `null` leaves the key id out of the header. */
  kid?: string | null
  alg?: string
  key?: CryptoKey
  /** Replaces the signature part with this text. */
  signature?: string
}

const encoder = new TextEncoder()

export function base64Url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? encoder.encode(bytes) : bytes
  let binary = ''
  for (const byte of raw) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
}

export async function createIdp(kid = 'key-1'): Promise<Idp> {
  const keyPair = await generateKeyPair()
  return {
    kid,
    keyPair,
    async certs() {
      const jwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey
      return { keys: [{ kid, kty: jwk.kty, alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }
    },
    async sign(claims, options = {}) {
      const header = base64Url(JSON.stringify({ alg: options.alg ?? 'RS256', ...(options.kid === null ? {} : { kid: options.kid ?? kid }), typ: 'JWT' }))
      const payload = base64Url(JSON.stringify(claims))
      const signed = `${header}.${payload}`
      if (options.signature !== undefined) return `${signed}.${options.signature}`
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', options.key ?? keyPair.privateKey, encoder.encode(signed))
      return `${signed}.${base64Url(new Uint8Array(signature))}`
    },
  }
}

/** The claims Access puts in a token for a person, valid for an hour from `now` (seconds). */
export function claimsFor(email: string, over: Record<string, unknown> = {}, now = Date.now() / 1000): Record<string, unknown> {
  return { iss: `https://${TEAM}`, aud: [AUD], email, sub: 'user-1', iat: now - 5, nbf: now - 5, exp: now + 3600, type: 'app', ...over }
}

export interface CertsFetch {
  fetch: typeof fetch
  /** Requests made to the certs endpoint. */
  calls: () => number
  /** Makes the next requests fail with this status (or succeed again with null). */
  failWith(status: number | null): void
  /** Replaces the keys served. */
  serve(idps: Idp[]): void
}

export function certsFetch(initial: Idp[]): CertsFetch {
  let served = initial
  let failing: number | null = null
  let calls = 0
  return {
    calls: () => calls,
    failWith: (status) => {
      failing = status
    },
    serve: (idps) => {
      served = idps
    },
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url !== `https://${TEAM}/cdn-cgi/access/certs`) return new Response('not found', { status: 404 })
      calls += 1
      const keys = (await Promise.all(served.map((idp) => idp.certs()))).flatMap((doc) => doc.keys)
      // A failing endpoint still sends the keys in its body here, so that a client which trusts a body without
      // looking at the status is caught.
      return new Response(JSON.stringify({ keys }), { status: failing ?? 200, headers: { 'content-type': 'application/json' } })
    },
  }
}
