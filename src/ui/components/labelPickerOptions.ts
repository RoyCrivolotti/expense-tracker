import type { Label } from '../../types'
import { transactionCountLabel } from './flagPickerOptions'

export { transactionCountLabel }

/**
 * Labels offered by a picker, given the ids already selected.
 *
 * Archived labels are excluded, except any already selected — same rule the
 * flag/category/account pickers follow: archiving stops you *choosing*
 * something new, it never breaks the record you are already editing by
 * making its own value unselectable.
 *
 * A selected id matching no label at all — not just archived, but fully gone
 * (legacy data, or a race with another tab's delete) — gets a synthetic
 * placeholder so it still renders as a chip instead of silently vanishing.
 */
export function selectableLabels(labels: Label[], selectedIds: number[]): Label[] {
  const selected = new Set(selectedIds)
  const filtered = labels.filter((l) => l.active || selected.has(l.id))
  const knownIds = new Set(labels.map((l) => l.id))
  const missing = selectedIds.filter((id) => !knownIds.has(id))
  const placeholders: Label[] = missing.map((id) => ({
    id,
    name: 'Deleted (unavailable)',
    color: '#9ca3af',
    sortOrder: -1,
    active: true,
  }))
  return [...placeholders, ...filtered]
}

/** What deleting a label will actually do, in the user's terms. */
export function labelDeleteMessage(usageCount: number): string {
  if (usageCount === 0) return 'Nothing is labeled with it, so nothing else changes.'
  return `${transactionCountLabel(usageCount)} will lose this label. Nothing else changes — no transaction is deleted.`
}
