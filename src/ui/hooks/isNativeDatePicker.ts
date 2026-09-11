export function isNativeDatePicker(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPod/.test(ua)) return true
  if (/iPad/.test(ua)) return true
  // iPadOS spoofs a Mac UA
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}
