import { useMediaQuery } from '../../hooks/useMediaQuery'

/** Below this the Goals tab stacks into one column and charts show one at a time. */
export const NARROW_MQ = '(max-width: 899px)'

export function useGoalsNarrow(): boolean {
  return useMediaQuery(NARROW_MQ)
}
