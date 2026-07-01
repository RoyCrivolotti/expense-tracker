export type AccessErrorKind = 'connection' | 'auth' | 'other'

/** Classify access-check failures for recovery UI (PWA vs browser). */
export function classifyAccessError(message: string): AccessErrorKind {
  const lower = message.toLowerCase()
  if (
    lower.includes('no-response') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('status":0') ||
    lower.includes('status: 0')
  ) {
    return 'connection'
  }
  if (
    lower.includes('not authenticated') ||
    lower.includes('not authorised') ||
    lower.includes('(401)') ||
    lower.includes('(403)')
  ) {
    return 'auth'
  }
  return 'other'
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}
