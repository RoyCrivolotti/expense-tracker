import { createContext, useContext } from 'react'

export interface GuideOpener {
  open: () => void
}

/** Absent outside the app (a test, the setup box on its own), where a link to the guide is not shown. */
export const GuideContext = createContext<GuideOpener | null>(null)

export const useGuide = (): GuideOpener | null => useContext(GuideContext)
