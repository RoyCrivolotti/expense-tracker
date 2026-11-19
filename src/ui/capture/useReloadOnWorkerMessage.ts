import { useEffect } from 'react'
import { reloadRecommendations } from '../../data/recommendationsApi'

// The same string as `REVIEW_CHANGED` in the worker, which the app does not import.
const REVIEW_CHANGED = 'review-changed'

/** Reads the payments to review again when the service worker says a push arrived while the app is open. */
export function useReloadOnWorkerMessage(): void {
  useEffect(() => {
    const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
    if (!container) return undefined
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data
      if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === REVIEW_CHANGED) reloadRecommendations()
    }
    container.addEventListener('message', onMessage)
    return () => container.removeEventListener('message', onMessage)
  }, [])
}
