/**
 * True on iOS where the native date/month picker is excellent and should be
 * kept. False everywhere else (desktop, Android) where we show a custom picker.
 *
 * iPadOS reports a desktop UA string, so we also check `maxTouchPoints > 1`
 * plus the "Macintosh" UA — a real Mac has maxTouchPoints 0 or 1.
 */
export function useIsNativeDatePicker(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPod/.test(ua)) return true
  if (/iPad/.test(ua)) return true
  // iPadOS spoofs a Mac UA
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}
