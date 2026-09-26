import { createContext } from 'react'

/**
 * How a docked tooltip tells whoever drew the chart whether it is on screen. The main
 * projection chart uses it to know whether its own legend has to show the values (the
 * tooltip is scrolled away) or must not repeat them (the tooltip is showing).
 */
export const TooltipVisibilityContext = createContext<((onScreen: boolean) => void) | null>(null)
