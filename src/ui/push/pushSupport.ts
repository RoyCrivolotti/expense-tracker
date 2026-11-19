import type { DevicePlatform } from '../../config/device'

/**
 * Whether this browser can take a push subscription. On an iPhone or iPad only a web app added to the Home Screen can
 * (Apple's rule), and Safari reports that as `navigator.standalone`; elsewhere the Push API is either there or not.
 */
export type PushSupport = 'ok' | 'not-installed' | 'unsupported'

export interface SupportHints {
  platform: DevicePlatform
  hasPush: boolean
  standalone: boolean
}

export function pushSupportFrom({ platform, hasPush, standalone }: SupportHints): PushSupport {
  if ((platform === 'iphone' || platform === 'ipad') && !standalone) return 'not-installed'
  return hasPush ? 'ok' : 'unsupported'
}

/** A name for this device in the list of devices, from what the browser says it is. */
export function deviceLabel(platform: DevicePlatform): string {
  switch (platform) {
    case 'iphone':
      return 'iPhone'
    case 'ipad':
      return 'iPad'
    case 'android':
      return 'Android phone'
    case 'mac':
      return 'Mac'
    case 'windows':
      return 'Windows PC'
    case 'linux':
      return 'Linux computer'
    default:
      return 'Device'
  }
}

/** The VAPID public key as `subscribe` wants it: the base64url text decoded to bytes. */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
