import { useMediaQuery } from '../../../hooks/useMediaQuery'

/**
 * A phone held upright, by touch: the milestone sheet is drawn on its side there, for a phone
 * whose rotation is locked (a page cannot turn the screen: `screen.orientation.lock` is not
 * there in Safari, and elsewhere only works in full screen). 600px is where a phone ends and a
 * tablet begins, which has the width for the sheet as it is.
 */
export const SIDEWAYS_MQ = '(orientation: portrait) and (hover: none) and (pointer: coarse) and (max-width: 599px)'

/** Whether a full-screen sheet is being drawn a quarter turn, as it is on an upright phone. */
export function useSideways(): boolean {
  return useMediaQuery(SIDEWAYS_MQ)
}
