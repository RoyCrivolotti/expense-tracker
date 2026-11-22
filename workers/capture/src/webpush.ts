/**
 * Web push on WebCrypto alone: the message encryption of RFC 8291 (`aes128gcm`, RFC 8188 framing) and the sender
 * identification of RFC 8292 (VAPID, an ES256 JWT). No dependency: the libraries need Node's `crypto` and `https`.
 */
const subtle = crypto.subtle
const text = new TextEncoder()

export function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

function newSenderKeys(): Promise<CryptoKeyPair> {
  return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as Promise<CryptoKeyPair>
}

/** What a test pins to reproduce a known message; a real send leaves both out and gets fresh ones. */
export interface EncryptOptions {
  salt?: Uint8Array
  senderKeys?: CryptoKeyPair
}

/**
 * The body of one push: header (salt, record size, sender key), then the payload and its delimiter in one AES-GCM
 * record. `userPublic` is the device's 65-byte P-256 key and `auth` its 16-byte secret, both as the browser gave them.
 * A payload here is far below one 4096-byte record.
 */
export async function encryptPayload(
  payload: string,
  userPublic: Uint8Array,
  auth: Uint8Array,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const sender = options.senderKeys ?? (await newSenderKeys())
  const device = await subtle.importKey('raw', userPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const senderPublic = new Uint8Array((await subtle.exportKey('raw', sender.publicKey)) as ArrayBuffer)
  // The standard member is `public`; the Workers typings spell it `$public`, so the object is passed as the type allows.
  const shared = new Uint8Array(
    await subtle.deriveBits(
      { name: 'ECDH', public: device } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      sender.privateKey,
      256,
    ),
  )
  const ikm = await hkdf(shared, auth, concat(text.encode('WebPush: info\0'), userPublic, senderPublic), 32)
  const key = await hkdf(ikm, salt, text.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, text.encode('Content-Encoding: nonce\0'), 12)
  const aes = await subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt'])
  const record = concat(text.encode(payload), new Uint8Array([2])) // 0x02 closes the last record: no padding
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))
  const header = concat(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([senderPublic.length]), senderPublic)
  return concat(header, sealed)
}

/** The deployment's VAPID key pair as the Worker holds it: the public point and the private scalar, base64url. */
export interface VapidKeys {
  publicKey: string
  privateKey: string
  /** A URL the push service can reach the operator at. */
  subject: string
}

const TOKEN_LIFETIME_S = 12 * 3600
/** Apple asks senders not to mint a token more than once an hour. */
const TOKEN_REUSE_MS = 3600 * 1000
const tokens = new Map<string, { header: string; at: number }>()

async function sign(
  keys: VapidKeys,
  audience: string,
  nowMs: number,
): Promise<string> {
  const point = base64urlDecode(keys.publicKey)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64urlEncode(point.slice(1, 33)),
    y: base64urlEncode(point.slice(33, 65)),
    d: keys.privateKey,
  }
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const encode = (value: object) => base64urlEncode(text.encode(JSON.stringify(value)))
  const input = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({ aud: audience, exp: Math.floor(nowMs / 1000) + TOKEN_LIFETIME_S, sub: keys.subject })}`
  // WebCrypto answers the 64-byte r||s form that JOSE wants, not DER.
  const signature = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text.encode(input)))
  return `vapid t=${input}.${base64urlEncode(signature)}, k=${keys.publicKey}`
}

/** The `Authorization` value for a push service's origin, reused within the isolate for an hour. */
export async function vapidAuthorization(
  keys: VapidKeys,
  audience: string,
  nowMs: number,
): Promise<string> {
  const id = `${audience}|${keys.publicKey}|${keys.subject}`
  const cached = tokens.get(id)
  if (cached && nowMs - cached.at < TOKEN_REUSE_MS && nowMs >= cached.at) return cached.header
  const header = await sign(keys, audience, nowMs)
  tokens.set(id, { header, at: nowMs })
  return header
}

export interface PushTargetKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushOptions {
  /** Seconds the push service keeps it for a device that is off. */
  ttl: number
  /** Coalesces undelivered messages: at most 32 URL-safe characters. */
  topic: string
  /** How long to wait for the push service before giving up. Defaults to `PUSH_TIMEOUT_MS`. */
  timeoutMs?: number
}

/** A slow push service must not hold the Worker's background task to the platform's own limit. */
export const PUSH_TIMEOUT_MS = 10_000

/** The push service did not answer within the time allowed. */
export class PushTimeoutError extends Error {
  constructor() {
    super('push service timed out')
    this.name = 'PushTimeoutError'
  }
}

/** Sends one encrypted message and answers the push service's response. `fetcher` is injected so tests need no network. */
export async function sendWebPush(
  target: PushTargetKeys,
  payload: string,
  keys: VapidKeys,
  options: PushOptions,
  fetcher: typeof fetch,
  nowMs: number,
): Promise<Response> {
  const body = await encryptPayload(payload, base64urlDecode(target.p256dh), base64urlDecode(target.auth))
  const authorization = await vapidAuthorization(keys, new URL(target.endpoint).origin, nowMs)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? PUSH_TIMEOUT_MS)
  try {
    return await fetcher(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttl),
        Urgency: 'high',
        Topic: options.topic,
      },
      body,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) throw new PushTimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
  }
}
