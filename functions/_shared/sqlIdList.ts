/**
 * D1 rejects a statement that binds more than 100 values, so a list of ids goes in as one JSON array and
 * comes back out as rows: `WHERE id ${IN_ID_LIST}` with `idList(ids)` as its single bound value. SQLite
 * still looks each id up by key. The caller owns the size cap (`MAX_BULK_DELETE`); this does not bound it.
 */
export const IN_ID_LIST = 'IN (SELECT value FROM json_each(?))'

export function idList(ids: readonly number[]): string {
  return JSON.stringify(ids)
}
