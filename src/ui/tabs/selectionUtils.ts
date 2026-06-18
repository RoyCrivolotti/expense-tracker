/** Toggle all ids in a day group: select if any are unselected, else clear the day. */
export function toggleDateSelection(selected: ReadonlySet<number>, ids: number[]): Set<number> {
  const next = new Set(selected)
  const allSelected = ids.length > 0 && ids.every((id) => next.has(id))
  for (const id of ids) {
    if (allSelected) next.delete(id)
    else next.add(id)
  }
  return next
}

export function dateSelectionState(
  selected: ReadonlySet<number>,
  ids: number[],
): 'none' | 'partial' | 'all' {
  if (ids.length === 0) return 'none'
  const count = ids.filter((id) => selected.has(id)).length
  if (count === 0) return 'none'
  if (count === ids.length) return 'all'
  return 'partial'
}
