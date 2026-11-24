import { useEffect } from 'react'

interface Badging {
  setAppBadge?: unknown
  clearAppBadge?: unknown
}

/**
 * Puts `count` on the Home Screen icon through the Badging API, or clears it at zero, where the browser has the API.
 * Firefox does not, nor does any browser in a tab rather than an installed app, and then nothing happens. A browser that has it may still
 * refuse (no notification permission, say): the number on the icon is a convenience, so a refusal is not reported.
 */
export async function showOnAppBadge(
  nav: unknown,
  count: number,
): Promise<void> {
  if (typeof nav !== 'object' || nav === null) return
  const badging = nav as Badging
  const call = count > 0 ? badging.setAppBadge : badging.clearAppBadge
  if (typeof call !== 'function') return
  try {
    await (call as (n?: number) => unknown).call(nav, ...(count > 0 ? [count] : []))
  } catch {
    // Refused: the icon keeps what it showed.
  }
}

/**
 * Keeps the Home Screen icon's number in step with the payments the app counts as waiting. `count` is null until the
 * list has been read, so an app still loading does not clear a number the service worker set from a push. The number
 * is written once when the count changes and once more each time a read lands (`loads`), even with the count the same:
 * a push that arrives while a decision waits out its undo sets the icon from the server's count, which still holds
 * that payment, and the next read is what puts the app's number back.
 */
export function useAppBadge(
  count: number | null,
  loads: number,
): void {
  useEffect(() => {
    if (count !== null) void showOnAppBadge(globalThis.navigator, count)
  }, [count, loads])
}
