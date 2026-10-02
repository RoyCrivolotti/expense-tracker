import { useMediaQuery } from '../hooks/useMediaQuery'

const DOCK_MQ = '(max-width: 719px)'

/** On narrow viewports, dock the tooltip to the chart instead of floating it at the pointer. */
export function useDockedTooltip(): boolean {
  return useMediaQuery(DOCK_MQ)
}
