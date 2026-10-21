/**
 * A D1 batch is one transaction that rolls back when a statement fails, but D1 has no statement that
 * aborts on a condition. A guard is a SELECT that fails exactly when its condition does not hold: SQLite
 * raises "integer overflow" for `abs` of the smallest integer, which no real value can produce. Put it
 * in the batch where the condition must be true, and everything before it is undone.
 *
 * The condition is evaluated at that point of the batch, so it sees the batch's own earlier writes and
 * nothing a concurrent request changes after the batch began.
 *
 * D1's REST API returns `integer overflow: SQLITE_ERROR` (code 7500) for it. A Worker binding may put a prefix
 * such as `D1_ERROR:` in front, which has not been tested, so `isGuardFailure` matches the substring and nothing
 * more. A batch that fails for any other reason, or with wording that does not contain it, is rethrown unchanged
 * and answers 500; nothing was written either way, because a failed batch is undone as a whole. The only other
 * statement in these batches that could overflow is the sum of one payment's covered cents, which amounts in
 * cents cannot reach.
 */
const FAILS = 'abs(-9223372036854775808)'

/** `prefix` is a leading `WITH` clause the condition reads from, when it needs one. */
export function guardSql(condition: string, prefix = ''): string {
  return `${prefix}SELECT CASE WHEN ${condition} THEN 1 ELSE ${FAILS} END AS ok`
}

/** Whether a rejected batch failed because a guard in it did not hold, not for any other reason. */
export function isGuardFailure(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 3; depth += 1) {
    if (/integer overflow/i.test(current.message)) return true
    current = current.cause
  }
  return false
}
