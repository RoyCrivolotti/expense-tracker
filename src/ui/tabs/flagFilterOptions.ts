import type { Flag } from '../../types'

/** The flags the filter can offer, or null when there is nothing to filter by. */
export function shownFlagOptions(
  flags: Flag[] | undefined,
  flagId: number | 'all' | 'none' | undefined,
  onFlag: unknown,
): Flag[] | null {
  const options = flags?.filter((f) => f.active || f.id === flagId) ?? []
  return options.length > 0 && flagId !== undefined && onFlag ? options : null
}
