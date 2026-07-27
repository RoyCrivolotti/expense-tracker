/**
 * Active items, plus `currentId` even if it's inactive — so something already
 * pointed at an archived category/account (via edit, duplicate, or a
 * recurring-description suggestion) never loses its own value from a picker.
 * Used by both the transaction form and the installment plan editor.
 *
 * `currentId === 0` is the "nothing selected yet" sentinel for a new record and is
 * never a real id, so it never triggers the placeholder branch below.
 *
 * If `currentId` doesn't match any item at all — not just inactive, but fully gone
 * (legacy data predating these delete guards, or a race with another tab's delete) —
 * a synthetic placeholder is added so the `<select>` still has a matching option.
 * Without it, the browser silently displays a different option than what `currentId`
 * holds, and submitting the form without touching this field would send the stale,
 * now-nonexistent id, which the backend rejects — blocking even unrelated field edits.
 */
export function selectableOptions<T extends { id: number; name: string; active: boolean }>(
  items: T[],
  currentId: number,
): T[] {
  const filtered = items.filter((item) => item.active || item.id === currentId)
  if (currentId === 0 || items.some((item) => item.id === currentId)) return filtered
  // `active: true` here isn't really a claim that this record is active — it's so
  // `optionLabel` below doesn't also tack "(archived)" onto a name that already says
  // "Deleted (unavailable)".
  const placeholder = { id: currentId, name: 'Deleted (unavailable)', active: true } as T
  return [placeholder, ...filtered]
}

/** Display label for a picker `<option>` — flags an inactive item so users know editing it archives nothing new. */
export function optionLabel(item: { name: string; active: boolean }): string {
  return item.active ? item.name : `${item.name} (archived)`
}
