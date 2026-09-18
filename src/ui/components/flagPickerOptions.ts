import type { Flag } from '../../types'

/**
 * Flags offered by a picker, for a control whose current value is `value`.
 *
 * Archived flags are excluded, except the one already applied — the same rule
 * the category/account pickers follow: archiving stops you *choosing* something
 * new, it never breaks the record you are already editing by making its own
 * value unselectable.
 *
 * If `value` matches no flag at all — not just archived, but fully gone (legacy
 * data, or a race with another tab's delete) — a synthetic placeholder is added
 * so the trigger and popover still have something to show instead of silently
 * falling back to "No flag".
 */
export function selectableFlags(flags: Flag[], value: number | null): Flag[] {
  const filtered = flags.filter((f) => f.active || f.id === value)
  if (value == null || flags.some((f) => f.id === value)) return filtered
  const placeholder: Flag = {
    id: value,
    name: 'Deleted (unavailable)',
    color: '#9ca3af',
    reimbursable: false,
    sortOrder: -1,
    active: true,
  }
  return [placeholder, ...filtered]
}

/** "3 transactions" / "1 transaction" — used in several flag messages. */
export function transactionCountLabel(count: number): string {
  return `${count} transaction${count === 1 ? '' : 's'}`
}

/** What deleting a flag will actually do, in the user's terms. */
export function flagDeleteMessage(usageCount: number): string {
  if (usageCount === 0) return 'Nothing is flagged with it, so nothing else changes.'
  return `${transactionCountLabel(usageCount)} will be unflagged. Nothing else changes — no transaction is deleted.`
}
