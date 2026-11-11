import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_KEY_PATTERN, hashSecret, mintCaptureKey, parseCaptureKey, secretMatches } from './captureKey'

// An invented key: the repo is public, so no test uses a real one.
const KEY_ID = '0123456789abcdef'
const SECRET = 'ab'.repeat(32)

afterEach(() => vi.restoreAllMocks())

describe('mintCaptureKey', () => {
  it('makes the documented shape, and the hash is of the secret alone', async () => {
    const minted = await mintCaptureKey()

    expect(minted.key).toMatch(CAPTURE_KEY_PATTERN)
    expect(minted.key).toHaveLength(85)
    expect(minted.key).toBe(`xpk_${minted.keyId}_${minted.secret}`)
    expect(minted.secretHash).toBe(await hashSecret(minted.secret))
    expect(minted.secretHash).not.toContain(minted.secret)
  })

  it('does not repeat', async () => {
    const keys = await Promise.all(Array.from({ length: 20 }, () => mintCaptureKey()))

    expect(new Set(keys.map((k) => k.key)).size).toBe(20)
  })
})

describe('parseCaptureKey', () => {
  it('splits a well-formed key into its id and secret', () => {
    expect(parseCaptureKey(`xpk_${KEY_ID}_${SECRET}`)).toEqual({ keyId: KEY_ID, secret: SECRET })
  })

  it.each([
    ['empty', ''],
    ['no prefix', `${KEY_ID}_${SECRET}`],
    ['a different prefix', `abc_${KEY_ID}_${SECRET}`],
    ['upper-case hex', `xpk_${KEY_ID.toUpperCase()}_${SECRET}`],
    ['a short id', `xpk_${KEY_ID.slice(1)}_${SECRET}`],
    ['a long secret', `xpk_${KEY_ID}_${SECRET}0`],
    ['a short secret', `xpk_${KEY_ID}_${SECRET.slice(1)}`],
    ['a non-hex character', `xpk_${KEY_ID}_${'g'.repeat(64)}`],
    ['trailing text', `xpk_${KEY_ID}_${SECRET} `],
    ['a second key', `xpk_${KEY_ID}_${SECRET}\nxpk_${KEY_ID}_${SECRET}`],
    ['base64url instead of hex', `xpk_${KEY_ID}_${'A_'.repeat(32)}`],
  ])('refuses %s', (_name, text) => {
    expect(parseCaptureKey(text)).toBeNull()
  })
})

describe('secretMatches', () => {
  it('accepts the secret the hash was made from, and no other', async () => {
    const hash = await hashSecret(SECRET)

    expect(await secretMatches(hash, SECRET)).toBe(true)
    expect(await secretMatches(hash, 'cd'.repeat(32))).toBe(false)
  })

  it('refuses a stored value that is not a SHA-256 digest', async () => {
    expect(await secretMatches('', SECRET)).toBe(false)
    expect(await secretMatches('zz'.repeat(32), SECRET)).toBe(false)
    expect(await secretMatches('ab'.repeat(31), SECRET)).toBe(false)
  })

  it('gives the same answers with timingSafeEqual and without it', async () => {
    const hash = await hashSecret(SECRET)
    const subtle = crypto.subtle as unknown as { timingSafeEqual?: unknown }
    const native = vi.fn((a: Uint8Array, b: Uint8Array) => a.every((byte, i) => byte === b[i]))
    subtle.timingSafeEqual = native
    try {
      expect(await secretMatches(hash, SECRET)).toBe(true)
      expect(await secretMatches(hash, 'cd'.repeat(32))).toBe(false)
      expect(native).toHaveBeenCalledTimes(2)
    } finally {
      delete subtle.timingSafeEqual
    }
    expect(await secretMatches(hash, SECRET)).toBe(true)
    expect(await secretMatches(hash, 'cd'.repeat(32))).toBe(false)
  })

  it('catches a difference in the last byte of the digest', async () => {
    const hash = await hashSecret(SECRET)
    const flipped = hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0')

    expect(await secretMatches(flipped, SECRET)).toBe(false)
  })
})
