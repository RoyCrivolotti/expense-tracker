/**
 * Active items, plus `currentId` even if it's inactive — so something already
 * pointed at an archived category/account (via edit, duplicate, or a
 * recurring-description suggestion) never loses its own value from a picker.
 * Used by both the transaction form and the installment plan editor.
 */
export function selectableOptions<T extends { id: number; active: boolean }>(
  items: T[],
  currentId: number,
): T[] {
  return items.filter((item) => item.active || item.id === currentId)
}
