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

/**
 * A phone, upright or on its side: touch, and a short side under 600px. A tablet or a laptop gives
 * the chart card the width to read thirty years in, so it has no use for a full-screen chart. A
 * comma list, not `or`, for the Safari versions that do not read the keyword.
 */
export const PHONE_MQ =
  '(hover: none) and (pointer: coarse) and (max-width: 599px), (hover: none) and (pointer: coarse) and (max-height: 599px)'

/** Whether this is a phone, in either orientation. */
export function usePhone(): boolean {
  return useMediaQuery(PHONE_MQ)
}
