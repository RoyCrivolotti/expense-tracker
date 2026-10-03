import { useMemo } from 'react'
import type { LeverKey } from '../../../../engine'
import type { StarredLevers } from '../useStarredLevers'
import { toggleKeepingFocus } from './starFocus'

/**
 * The levers with a `toggle` that keeps the keyboard's place (see toggleKeepingFocus). Where focus
 * goes when no star is left is the button that opens the panel, named by the id it controls.
 */
export function useKeyboardStarToggle(levers: StarredLevers, panelId: string): StarredLevers {
  return useMemo(() => {
    const toFallback = () => document.querySelector<HTMLElement>(`[aria-controls="${panelId}"]`)
    return { ...levers, toggle: (key: LeverKey) => toggleKeepingFocus(() => levers.toggle(key), toFallback) }
  }, [levers, panelId])
}
