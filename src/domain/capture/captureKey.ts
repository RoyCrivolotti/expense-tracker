/**
 * The key a phone's Shortcut sends with each push: `xpk_<16 hex>_<64 hex>`. The first part is a public id the
 * server looks the key up by; the second is the secret, 256 random bits, of which only a SHA-256 is kept. The parts
 * are hex and not base64url because base64url can hold `_`, which would make the split ambiguous, and a fixed
 * length lets one pattern refuse anything else before any lookup.
 */
export const CAPTURE_KEY_PATTERN = /^xpk_([0-9a-f]{16})_([0-9a-f]{64})$/

export interface CaptureKeyParts {
  keyId: string
  secret: string
}

export interface MintedCaptureKey extends CaptureKeyParts {
  /** The whole key, shown to its owner once. */
  key: string
  /** What is stored in place of the secret. */
  secretHash: string
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return toHex(buffer)
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export async function hashSecret(secret: string): Promise<string> {
  return toHex(await sha256(secret))
}

export async function mintCaptureKey(): Promise<MintedCaptureKey> {
  const keyId = randomHex(8)
  const secret = randomHex(32)
  return { keyId, secret, key: `xpk_${keyId}_${secret}`, secretHash: await hashSecret(secret) }
}

/** The parts of a well-formed key, or null for anything else. Does no lookup and compares nothing. */
export function parseCaptureKey(text: string): CaptureKeyParts | null {
  const match = CAPTURE_KEY_PATTERN.exec(text)
  return match ? { keyId: match[1] as string, secret: match[2] as string } : null
}

type TimingSafeSubtle = SubtleCrypto & { timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean }

/**
 * Whether `secret` is the one `storedHash` was made from. It compares two digests of the same length rather than the
 * secrets, so the time taken does not depend on how much of a guess is right. `timingSafeEqual` is a Workers
 * extension that not every runtime has, and the fallback reads all 32 bytes without stopping at the first difference.
 */
export async function secretMatches(storedHash: string, secret: string): Promise<boolean> {
  const given = await sha256(secret)
  const stored = hexToBytes(storedHash)
  if (stored === null || stored.length !== given.length) return false
  const subtle = crypto.subtle as TimingSafeSubtle
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(given, stored)
  let difference = 0
  for (let i = 0; i < given.length; i++) difference |= (given[i] as number) ^ (stored[i] as number)
  return difference === 0
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return null
  return Uint8Array.from(hex.match(/../g) as string[], (pair) => parseInt(pair, 16))
}
