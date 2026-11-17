/**
 * What the setup and diagnostics screens read about a person's pushes. Counts only: nothing here returns a push's
 * text, digits or amount.
 */

/** Every source word the person's pushes were ever counted under, from the counters' key alone. */
export const COUNTED_SOURCES_SQL = 'SELECT DISTINCT source FROM capture_counters WHERE owner = ?1 ORDER BY source'

/**
 * Per source, the pushes stored since a day and what became of them: `capture_events.outcome` as the decision wrote
 * it, and whether the recommendation is still open. The source list comes from the counters so the events are reached
 * through `(owner, source, received_at)`, one range per source, rather than every event the person ever stored.
 */
export const SOURCE_OUTCOMES_SQL = `SELECT e.source AS source,
  COUNT(*) AS recommended,
  COALESCE(SUM(e.outcome = 'added-as-is'), 0) AS added_as_is,
  COALESCE(SUM(substr(e.outcome, 1, 7) = 'edited:'), 0) AS edited,
  COALESCE(SUM(e.outcome = 'linked'), 0) AS linked,
  COALESCE(SUM(e.outcome = 'dismissed'), 0) AS dismissed,
  COALESCE(SUM(r.state = 'open'), 0) AS open
FROM capture_events e
LEFT JOIN recommendations r ON r.id = e.rec_id AND r.owner = e.owner
WHERE e.owner = ?1 AND e.source IN (SELECT DISTINCT source FROM capture_counters WHERE owner = ?1) AND e.received_at >= ?2
GROUP BY e.source`

/** Per source, how many of the person's templates their dismissals muted. At most 500 templates a person. */
export const MUTED_TEMPLATES_SQL = `SELECT source, COUNT(*) AS muted FROM capture_templates
WHERE owner = ?1 AND ignored_at IS NOT NULL GROUP BY source`
