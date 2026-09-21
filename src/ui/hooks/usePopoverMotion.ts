import type { CSSProperties } from 'react'
import { exitVars } from './motion'
import type { Position } from './usePopoverPosition'
import { useExit } from './usePresence'

/**
 * What a portalled popover needs to arrive and leave.
 *
 * `data-side` lets the stylesheet slide it away from the trigger it came from, and only
 * a little: opacity and a few pixels, never a scale, because `usePopoverPosition` reads
 * the popover's box to place it and a scaled box measures smaller than it is. While it
 * leaves it takes no input, so a second tap cannot pick a date twice.
 */
export function usePopoverMotion(pos: Position | null): {
  leaving: boolean
  exit: CSSProperties | undefined
  attrs: { 'data-side': 'above' | 'below'; inert: boolean }
} {
  const { leaving, exitMs } = useExit()
  return {
    leaving,
    exit: exitVars(leaving, exitMs),
    attrs: { 'data-side': pos?.above ? 'above' : 'below', inert: leaving },
  }
}
