import { useEffect, useState } from 'react'

/**
 * Hold back a live-region message until it stops changing.
 *
 * The transaction list's result count updates on every keystroke in the search
 * box, so announcing it directly made a screen reader read a new total for each
 * letter of "coffee". Waiting for the typing to stop announces the answer once.
 *
 * Starts empty and stays empty until the first change, so the region is present
 * and silent on load rather than reading the count at every mount.
 */
export function useDebouncedAnnouncement(message: string, delayMs = 700): string {
  const [announced, setAnnounced] = useState('')
  const [previous, setPrevious] = useState(message)

  useEffect(() => {
    if (message === previous) return
    const id = setTimeout(() => {
      setPrevious(message)
      setAnnounced(message)
    }, delayMs)
    return () => clearTimeout(id)
  }, [message, previous, delayMs])

  return announced
}
