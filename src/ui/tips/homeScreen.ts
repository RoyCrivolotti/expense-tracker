export type HomeScreenAdvice = 'ios' | 'android' | null

interface Env {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean
}

/**
 * What to say about putting the app on the Home Screen: only to a phone (or tablet) in its browser, never to the installed app,
 * which has nothing left to install, and never to a computer, where the same line would be noise.
 */
export function homeScreenAdviceFor({ userAgent, maxTouchPoints, standalone }: Env): HomeScreenAdvice {
  if (standalone) return null
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios'
  // iPadOS asks for the desktop site and says it is a Mac, but a Mac has no touch screen.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  return null
}

/**
 * The installed app: the display mode says so, and Safari's own flag does on iOS. Written so that a browser that cannot answer
 * is read as a browser, since a line that is shown wrongly is only a line, and one that throws takes the Dashboard with it.
 */
function isStandalone(): boolean {
  let mode = false
  try {
    mode = window.matchMedia('(display-mode: standalone)').matches
  } catch {
    /* no media queries here: not the installed app */
  }
  return mode || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function homeScreenAdvice(): HomeScreenAdvice {
  return homeScreenAdviceFor({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: isStandalone(),
  })
}
