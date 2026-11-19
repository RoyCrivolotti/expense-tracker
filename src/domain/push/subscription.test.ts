import { describe, expect, it } from 'vitest'
import { authSecretOf, isPushMode, isTimeZone, p256dhOf, pushServiceEndpointOf } from './subscription'

const APPLE = 'https://web.push.apple.com/QGZkYjM0ZTQtNzhlYi00ZjA4LWI1YjEtNDI0ZDQ4ZjU5MDMx'

describe('a push service endpoint', () => {
  it('is an https URL on one of the known services, kept as the sender will use it', () => {
    for (const url of [APPLE, 'https://fcm.googleapis.com/fcm/send/abc:def', 'https://updates.push.services.mozilla.com/wpush/v2/gAAAA', 'https://wns2-par02p.notify.windows.com/w/?token=AwYAAA']) {
      expect(pushServiceEndpointOf(url), url).toBe(url)
    }
  })

  it('is written one way whatever the browser’s spelling, so one device is one row', () => {
    expect(pushServiceEndpointOf(` ${APPLE}\n`)).toBe(APPLE)
    expect(pushServiceEndpointOf(APPLE.replace('web.push.apple.com', 'WEB.PUSH.APPLE.COM'))).toBe(APPLE)
    expect(pushServiceEndpointOf(APPLE.replace('web.push.apple.com', 'web.push.apple.com:443'))).toBe(APPLE)
  })

  it('is nothing else: another host, a host that only ends like one, http, another port, a fragment, junk', () => {
    for (const url of [
      'https://web.push.apple.com:8443/x',
      'https://evil.example/web.push.apple.com',
      'https://web.push.apple.com.evil.example/x',
      'https://notify.windows.com/w/',
      'https://evil.example/?x=.notify.windows.com',
      'http://web.push.apple.com/x',
      `${APPLE}#frag`,
      'not a url',
      '',
      42,
      null,
      `https://web.push.apple.com/${'a'.repeat(1100)}`,
    ]) {
      expect(pushServiceEndpointOf(url), String(url)).toBeNull()
    }
  })
})

describe('the subscription keys', () => {
  const key = `B${'A'.repeat(86)}`
  it('take the browser’s base64url, padded or not, at the exact lengths', () => {
    expect(p256dhOf(key)).toBe(key)
    expect(p256dhOf(`${key}=`)).toBe(key)
    expect(authSecretOf('a'.repeat(22))).toBe('a'.repeat(22))
    expect(authSecretOf(`${'a'.repeat(22)}==`)).toBe('a'.repeat(22))
  })

  it('refuse other lengths, other alphabets, a point that is not uncompressed, and non-strings', () => {
    expect(p256dhOf(`A${'A'.repeat(86)}`)).toBeNull()
    expect(p256dhOf(`B${'A'.repeat(85)}`)).toBeNull()
    expect(p256dhOf(`B${'A'.repeat(85)}+`)).toBeNull()
    expect(p256dhOf(undefined)).toBeNull()
    expect(authSecretOf('a'.repeat(21))).toBeNull()
    expect(authSecretOf('a'.repeat(21) + '/')).toBeNull()
    expect(authSecretOf(22)).toBeNull()
  })
})

describe('the mode and the zone', () => {
  it('are one of three words, and a zone name Intl knows', () => {
    expect(['each', 'daily', 'weekly'].every(isPushMode)).toBe(true)
    expect(['hourly', 'EACH', '', 3, null].some(isPushMode)).toBe(false)
    expect(isTimeZone('Europe/Madrid')).toBe(true)
    expect(isTimeZone('America/Argentina/Buenos_Aires')).toBe(true)
    expect(isTimeZone('UTC')).toBe(true)
    for (const bad of ['Mars/Olympus', '', 'Europe/Madrid'.padEnd(65, 'x'), 7, undefined]) expect(isTimeZone(bad), String(bad)).toBe(false)
  })
})
