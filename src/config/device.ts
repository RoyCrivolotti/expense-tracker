export type DevicePlatform = 'iphone' | 'ipad' | 'android' | 'mac' | 'windows' | 'linux' | 'unknown'

/** What the browser says about the device, passed in so the reading can be tested with any strings. */
export interface DeviceHints {
  userAgent: string
  platform: string
  maxTouchPoints: number
}

/**
 * The kind of device from the browser's own description. The operating system's version is never read: Safari freezes
 * the version it reports, so any number taken from here would be wrong for the people it matters to.
 */
export function platformFrom({ userAgent, platform, maxTouchPoints }: DeviceHints): DevicePlatform {
  if (/iPhone|iPod/.test(userAgent)) return 'iphone'
  if (/iPad/.test(userAgent)) return 'ipad'
  // Android's user agent also says Linux, so it is read first.
  if (/Android/.test(userAgent)) return 'android'
  if (/Macintosh/.test(userAgent) || /^Mac/.test(platform)) {
    // iPadOS Safari describes itself as a Mac; only the touch screen tells them apart.
    return maxTouchPoints > 1 ? 'ipad' : 'mac'
  }
  if (/Windows/.test(userAgent)) return 'windows'
  if (/Linux|X11/.test(userAgent)) return 'linux'
  return 'unknown'
}

/** This browser's platform, or `unknown` where there is no browser to ask. */
export function devicePlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  return platformFrom({
    userAgent: navigator.userAgent ?? '',
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  })
}

/** An iPhone or iPad: the only devices where Shortcuts, and so capture, can run. */
export function isAppleTouch(platform: DevicePlatform): boolean {
  return platform === 'iphone' || platform === 'ipad'
}
