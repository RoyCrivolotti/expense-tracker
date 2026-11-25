/**
 * The chosen rows an action will leave alone because they are not on screen, said at
 * the moment of committing. The bar already counts them, but that is easy to miss, and
 * someone who chose eleven rows should not believe all eleven were changed.
 */
export function offScreenNote(
  hiddenCount: number,
  outcome: 'deleted' | 'changed',
): string {
  if (hiddenCount <= 0) return ''
  const verb = hiddenCount === 1 ? "isn't" : "aren't"
  return `${hiddenCount} more you selected ${verb} shown and won't be ${outcome}.`
}

export function batchDeleteMessage(
  count: number,
  hiddenCount = 0,
): string {
  const noun = count === 1 ? 'transaction' : 'transactions'
  const note = offScreenNote(hiddenCount, 'deleted')
  return `${count} ${noun} will be removed permanently.${note ? ` ${note}` : ''}`
}

/**
 * Rows can vanish between selecting them and confirming — another device, another tab,
 * a cascade from a deleted plan. Reporting the count that was asked for rather than the
 * one the server touched hides exactly that.
 */
export function bulkOutcomeCopy(
  verb: 'Deleted' | 'Updated' | 'Renamed',
  done: number,
  requested: number,
  /** Appended after a rename, so the toast says what the rows are now called. */
  renamedTo?: string,
): string {
  const suffix = renamedTo === undefined ? '' : ` to ${renamedTo}`
  if (done < requested) return `${verb} ${done} of ${requested} transactions${suffix}`
  return `${verb} ${done} transaction${done === 1 ? '' : 's'}${suffix}`
}
