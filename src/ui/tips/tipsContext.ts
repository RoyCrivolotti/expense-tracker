import { createContext, useContext } from 'react'

/** What a card needs to know about the tips, and do about them. */
export interface Tips {
  /** Whether this tip is to be shown now: the session can write, and the person has neither put it away nor been here before. */
  isShown: (id: string) => boolean
  /** Puts the tip away on the account. It is gone on screen at once, and a failed save only means it returns on the next visit. */
  dismiss: (id: string) => void
  /** Brings every tip back, on every device. Rejects when the save fails, so the caller can say so. */
  showAgain: () => Promise<void>
}

export const NO_TIPS: Tips = {
  isShown: () => false,
  dismiss: () => undefined,
  showAgain: () => Promise.resolve(),
}

export const TipsContext = createContext<Tips>(NO_TIPS)

export const useTips = (): Tips => useContext(TipsContext)

/** What puts the card around it away on the account, after handing on any focus it holds. Provided by `TipCard`, used by `TipLink`. */
export const PutAwayContext = createContext<() => void>(() => undefined)
