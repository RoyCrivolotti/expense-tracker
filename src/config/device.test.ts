import { afterEach, describe, expect, it, vi } from 'vitest'
import { devicePlatform, isAppleTouch, platformFrom, type DeviceHints, type DevicePlatform } from './device'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPOD =
  'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const hints = (userAgent: string, platform = '', maxTouchPoints = 0): DeviceHints => ({ userAgent, platform, maxTouchPoints })

describe('platformFrom', () => {
  it.each([
    ['an iPhone', hints(IPHONE, 'iPhone', 5), 'iphone'],
    ['an iPod touch', hints(IPOD, 'iPod touch', 5), 'iphone'],
    ['an iPad that names itself', hints(IPAD, 'iPad', 5), 'ipad'],
    ['an iPad that says it is a Mac', hints(MAC, 'MacIntel', 5), 'ipad'],
    ['a Mac', hints(MAC, 'MacIntel', 0), 'mac'],
    ['a Mac reporting one touch point', hints(MAC, 'MacIntel', 1), 'mac'],
    ['a Mac whose user agent says nothing', hints('', 'MacIntel', 0), 'mac'],
    ['an Android phone, though its user agent says Linux', hints(ANDROID, 'Linux armv81', 5), 'android'],
    ['Windows', hints(WINDOWS, 'Win32', 0), 'windows'],
    ['Linux', hints(LINUX, 'Linux x86_64', 0), 'linux'],
    ['an empty description', hints(''), 'unknown'],
  ] as const)('reads %s', (_, given, expected) => {
    expect(platformFrom(given)).toBe(expected)
  })
})

describe('devicePlatform', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads this browser', () => {
    vi.stubGlobal('navigator', { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 })

    expect(devicePlatform()).toBe('ipad')
  })

  it('treats fields a browser leaves out as empty', () => {
    vi.stubGlobal('navigator', {})

    expect(devicePlatform()).toBe('unknown')
  })

  it('says unknown where there is no browser', () => {
    vi.stubGlobal('navigator', undefined)

    expect(devicePlatform()).toBe('unknown')
  })
})

describe('isAppleTouch', () => {
  it('is true only for an iPhone or an iPad', () => {
    const all: DevicePlatform[] = ['iphone', 'ipad', 'android', 'mac', 'windows', 'linux', 'unknown']
    expect(all.filter(isAppleTouch)).toEqual(['iphone', 'ipad'])
  })
})
