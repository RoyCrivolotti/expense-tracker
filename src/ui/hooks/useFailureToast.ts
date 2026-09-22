import { useEffect } from 'react'
import { ApiError } from '../../data/apiClient'
import type { ToastApi } from './useToast'

/** What to tell the user about a failure nobody caught. */
export function failureMessage(reason: unknown): string {
  // The API's messages are written for the user already: a validation error says
  // what to fix, and a fault says so without the internals.
  if (reason instanceof ApiError) return reason.message
  if (reason instanceof TypeError && /fetch|network/i.test(reason.message)) {
    return "Couldn't reach the server. Check your connection and try again."
  }
  return "Something went wrong, so that change probably wasn't saved."
}

/**
 * Last line of defence: a rejection or error nobody handled becomes a toast.
 *
 * Forms that catch their own failures show them inline and never reach here. The
 * fire-and-forget calls (`void actions.updateScenario(...)`) do, and before this
 * they failed in silence — a saved plan that quietly stayed unsaved was only
 * visible in the network tab.
 */
export function useFailureToast(showToast: ToastApi['showToast']): void {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      showToast(failureMessage(event.reason), 'error')
    }
    const onError = (event: ErrorEvent) => {
      // A failed image or script load also fires `error` on window, with no
      // `error` object; those are not a user's action failing.
      if (event.error instanceof Error) showToast(failureMessage(event.error), 'error')
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [showToast])
}
