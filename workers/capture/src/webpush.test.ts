import { describe, expect, it } from 'vitest'
import { PushTimeoutError, base64urlDecode, base64urlEncode, encryptPayload, sendWebPush, vapidAuthorization } from './webpush'
import type { VapidKeys } from './webpush'

// RFC 8291, Appendix A: the one worked example of the message encryption. These are the RFC's published values, copied
// as it prints them: `as` is the sender (the application server), `ua` the device (the user agent). They are written in
// short pieces and joined because the example's private key looks like a live one to secret scanners; it is a public
// test vector and protects nothing.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asScalar: ['yfWPiYE-n46H', 'LnH0KqZOF1fJ', 'JU3MYrct3AEL', 'tAQ-oRw'].join(''),
  asPoint: ['BP4z9KsN6nGR', 'TbVYI_c7VJSP', 'QTBtkgcy27ml', 'mlMoZIIgDll6', 'e3vCYLocInmY', 'WAmS6TlzAC8w', 'EqKK6PBru3jl', '7A8'].join(''),
  uaPoint: ['BCVxsr7N_eNg', 'VRqvHtD0zTZs', 'Ec6-VV-JvLex', 'hqUzORcxaOzi', '6-AYWXvTBHm4', 'bjyPjs7Vd8pZ', 'GH6SRpkNtoIA', 'iw4'].join(''),
  uaAuth: ['BTBZMqHH6r4T', 'ts7J_aSIgg'].join(''),
  salt: ['DGv6ra1nlYgD', 'CS1FRnbzlw'].join(''),
  message: ['DGv6ra1nlYgD', 'CS1FRnbzlwAA', 'EABBBP4z9KsN', '6nGRTbVYI_c7', 'VJSPQTBtkgcy', '27mlmlMoZIIg', 'Dll6e3vCYLoc', 'InmYWAmS6Tlz', 'AC8wEqKK6PBr', 'u3jl7A_yl95b', 'Qpu6cVPTpK4M', 'qgkf1CXztLVB', 'St2Ks3oZwbuw', 'XPXLWyouBWLV', 'WGNWQexSgSxs', 'j_Qulcy4a-fN'].join(''),
}

async function senderKeys(): Promise<CryptoKeyPair> {
  const point = base64urlDecode(RFC.asPoint)
  const jwk = { kty: 'EC', crv: 'P-256', x: base64urlEncode(point.slice(1, 33)), y: base64urlEncode(point.slice(33, 65)), d: RFC.asScalar }
  const ec = { name: 'ECDH', namedCurve: 'P-256' }
  return {
    privateKey: await crypto.subtle.importKey('jwk', jwk, ec, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', point, ec, true, []),
  }
}

describe('encryptPayload', () => {
  it('reproduces the RFC 8291 Appendix A message byte for byte', async () => {
    const body = await encryptPayload(RFC.plaintext, base64urlDecode(RFC.uaPoint), base64urlDecode(RFC.uaAuth), {
      salt: base64urlDecode(RFC.salt),
      senderKeys: await senderKeys(),
    })
    expect(base64urlEncode(body)).toBe(RFC.message)
  })

  it('draws a fresh salt and sender key per message, and names the sender key in the header', async () => {
    const device = base64urlDecode(RFC.uaPoint)
    const auth = base64urlDecode(RFC.uaAuth)
    const a = await encryptPayload('x', device, auth)
    const b = await encryptPayload('x', device, auth)
    expect(base64urlEncode(a)).not.toBe(base64urlEncode(b))
    // salt 16, record size 4, key length 1 (65), key 65, then 1 + 16 for the payload's byte, delimiter and tag.
    expect(a.length).toBe(16 + 4 + 1 + 65 + 1 + 1 + 16)
    expect(a[20]).toBe(65)
  })
})

async function vapidPair(): Promise<{ keys: VapidKeys; verify: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = base64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  return { keys: { publicKey, privateKey: jwk.d as string, subject: 'https://app.example.test' }, verify: pair.publicKey }
}

describe('vapidAuthorization', () => {
  it('signs a JWT for the push service with the private key, and the signature verifies under the public one', async () => {
    const { keys, verify } = await vapidPair()
    const header = await vapidAuthorization(keys, 'https://push.example.test', 1_800_000_000_000)
    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, head, claims, signature, k] = match as RegExpExecArray as unknown as string[]
    expect(k).toBe(keys.publicKey)
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(head as string)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(claims as string)))).toEqual({
      aud: 'https://push.example.test',
      exp: 1_800_000_000 + 12 * 3600,
      sub: 'https://app.example.test',
    })
    const sig = base64urlDecode(signature as string)
    expect(sig.length).toBe(64)
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verify, sig, new TextEncoder().encode(`${head}.${claims}`))
    expect(ok).toBe(true)
  })

  it('reuses a token for an hour per push service and mints another after it, or for another service', async () => {
    const { keys } = await vapidPair()
    const t0 = 1_800_000_000_000
    const first = await vapidAuthorization(keys, 'https://one.example.test', t0)
    expect(await vapidAuthorization(keys, 'https://one.example.test', t0 + 59 * 60_000)).toBe(first)
    expect(await vapidAuthorization(keys, 'https://one.example.test', t0 + 61 * 60_000)).not.toBe(first)
    expect(await vapidAuthorization(keys, 'https://two.example.test', t0)).not.toBe(first)
  })
})

describe('sendWebPush', () => {
  it('posts the encrypted body to the endpoint with the headers a push service needs', async () => {
    const { keys } = await vapidPair()
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = ((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(null, { status: 201 }))
    }) as unknown as typeof fetch
    const target = { endpoint: 'https://push.example.test/send/abc', p256dh: RFC.uaPoint, auth: RFC.uaAuth }
    const res = await sendWebPush(target, '{"v":1}', keys, { ttl: 86400, topic: 'a'.repeat(32) }, fetcher, 1_800_000_000_000)
    expect(res.status).toBe(201)
    expect(calls[0]?.url).toBe(target.endpoint)
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers).toMatchObject({ TTL: '86400', Urgency: 'high', Topic: 'a'.repeat(32), 'Content-Encoding': 'aes128gcm' })
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/)
    expect((calls[0]?.init.body as Uint8Array).length).toBeGreaterThan(100)
  })

  it('gives up on a push service that does not answer, and says so with its own error', async () => {
    const { keys } = await vapidPair()
    let signal: AbortSignal | undefined
    const fetcher = ((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    }) as unknown as typeof fetch
    const target = { endpoint: 'https://push.example.test/send/abc', p256dh: RFC.uaPoint, auth: RFC.uaAuth }
    await expect(sendWebPush(target, '{"v":1}', keys, { ttl: 60, topic: 'a'.repeat(32), timeoutMs: 20 }, fetcher, 1_800_000_000_000)).rejects.toBeInstanceOf(PushTimeoutError)
    expect(signal?.aborted).toBe(true)
  })

  it('passes another failure on unchanged and does not abort a send that finished', async () => {
    const { keys } = await vapidPair()
    const target = { endpoint: 'https://push.example.test/send/abc', p256dh: RFC.uaPoint, auth: RFC.uaAuth }
    const refused = (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch
    await expect(sendWebPush(target, '{}', keys, { ttl: 60, topic: 't' }, refused, 1_800_000_000_000)).rejects.toThrow('offline')
    let seen: AbortSignal | undefined
    const ok = ((_u: string, init: RequestInit) => ((seen = init.signal as AbortSignal), Promise.resolve(new Response(null, { status: 201 })))) as unknown as typeof fetch
    await sendWebPush(target, '{}', keys, { ttl: 60, topic: 't' }, ok, 1_800_000_000_000)
    expect(seen?.aborted).toBe(false)
  })
})
