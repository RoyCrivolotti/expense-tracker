import type { Flag } from '../../types'

/**
 * Flags offered by a picker, for a control whose current value is `value`.
 *
 * Archived flags are excluded, except the one already applied — the same rule
 * the category/account pickers follow: archiving stops you *choosing* something
 * new, it never breaks the record you are already editing by making its own
 * value unselectable.
 */
export function selectableFlags(flags: Flag[], value: number | null): Flag[] {
  return flags.filter((f) => f.active || f.id === value)
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
