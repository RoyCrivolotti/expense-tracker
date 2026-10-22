import { useEffect } from 'react'
import { useToast } from './useToast'

/**
 * Tells the user when a read made in the background failed and what they see may be out of date, with the
 * button that reads it again. It speaks once per failure: the message comes back only after the error has
 * been cleared by a refresh that worked.
 */
export function useBackgroundErrorToast(error: string | null | undefined, refresh: () => void): void {
  const { showToast } = useToast()
  useEffect(() => {
    if (!error) return
    showToast('Some figures may be out of date.', 'error', { label: 'Refresh', onAction: refresh })
  }, [error, refresh, showToast])
}
