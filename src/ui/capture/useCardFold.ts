import { useCallback, useState } from 'react'

const STORAGE_KEY = 'exp-review-card'

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'open'
  } catch {
    /* private mode or blocked storage: the card is one line, as it is by default */
    return false
  }
}

/**
 * Whether the "To review" card is open. It is one line until someone opens it, and it stays the way it was left on
 * this device: how much of the Dashboard the card may take is a way of looking, not something to sync.
 */
export function useCardFold(): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(readOpen)
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'open' : 'folded')
    } catch {
      /* the choice holds for this visit */
    }
  }, [])
  return [open, setOpen]
}
