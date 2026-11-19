import { describe, expect, it } from 'vitest'
import { applicationServerKey, deviceLabel, pushSupportFrom } from './pushSupport'

describe('whether this browser can take a subscription', () => {
  it('needs the Home Screen on an iPhone or iPad, and the Push API anywhere', () => {
    expect(pushSupportFrom({ platform: 'iphone', hasPush: true, standalone: false })).toBe('not-installed')
    expect(pushSupportFrom({ platform: 'ipad', hasPush: false, standalone: false })).toBe('not-installed')
    expect(pushSupportFrom({ platform: 'iphone', hasPush: true, standalone: true })).toBe('ok')
    expect(pushSupportFrom({ platform: 'mac', hasPush: true, standalone: false })).toBe('ok')
    expect(pushSupportFrom({ platform: 'android', hasPush: false, standalone: false })).toBe('unsupported')
    expect(pushSupportFrom({ platform: 'unknown', hasPush: false, standalone: true })).toBe('unsupported')
  })
})

describe('the device’s name and the server key', () => {
  it('names the device after what the browser says it is', () => {
    expect(deviceLabel('iphone')).toBe('iPhone')
    expect(deviceLabel('ipad')).toBe('iPad')
    expect(deviceLabel('android')).toBe('Android phone')
    expect(deviceLabel('mac')).toBe('Mac')
    expect(deviceLabel('windows')).toBe('Windows PC')
    expect(deviceLabel('linux')).toBe('Linux computer')
    expect(deviceLabel('unknown')).toBe('Device')
  })

  it('decodes the base64url key to its 65 bytes, whatever the padding', () => {
    const bytes = new Uint8Array(65)
    bytes[0] = 4
    for (let i = 1; i < 65; i++) bytes[i] = i
    const base64url = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(base64url).toHaveLength(87)
    expect(applicationServerKey(base64url)).toEqual(bytes)
    expect(applicationServerKey(`${base64url}=`)).toEqual(bytes)
  })
})
