import { devicePlatform, isAppleTouch } from '../../config/device'

export function isNativeDatePicker(): boolean {
  return isAppleTouch(devicePlatform())
}
