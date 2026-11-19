import { useEffect } from 'react'
import { holdRecommendationReloads, reloadRecommendations } from '../../data/recommendationsApi'

/** A return sooner than this after the last read adds nothing, so a quick switch between apps does not read again. */
export const RETURN_THROTTLE_MS = 30_000

/**
 * Reads the payments to review again when the app comes back to the foreground, or a page restored from the
 * back-forward cache is shown. A Home Screen web app is suspended rather than closed, so without this a payment captured
 * in the meantime appears only after a quit.
 */
export function useReloadOnReturn(): void {
  useEffect(() => {
    // The list was read when this mounted.
    let last = Date.now()
    const back = () => {
      const now = Date.now()
      if (now - last < RETURN_THROTTLE_MS) return
      last = now
      reloadRecommendations()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') back()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', back)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', back)
    }
  }, [])
}

/** Holds reloads of the list while `open`, such as the add form or the queue sheet. */
export function useHoldReloads(open: boolean): void {
  useEffect(() => (open ? holdRecommendationReloads() : undefined), [open])
}
