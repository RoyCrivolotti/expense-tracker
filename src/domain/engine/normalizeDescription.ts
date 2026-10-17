/**
 * The identity of a description everywhere the app compares or groups them: trimmed, case-folded text.
 * It is the recurring-series key, the Spending group-by, the autocomplete key, and the value stored in
 * `transactions.description_norm`.
 *
 * That last use makes it a persisted contract. A change to what this returns leaves every stored value
 * stale, and nothing recomputes a stored value that is not NULL. So a change needs a migration that sets
 * `description_norm` to NULL (the server then refills it), and `normalizeDescription.test.ts` pins the
 * results for a corpus so that a change is a failing test and not a quiet one.
 */
export function normalizeDesc(description: string): string {
  return description.trim().toLowerCase()
}
