/** D1 reports a change count on a write: 0 means the guard in the statement stopped it. */
export async function changed(db: D1Database, sql: string, ...params: Array<string | number | null>): Promise<boolean> {
  const result = await db
    .prepare(sql)
    .bind(...params)
    .run()
  return (result.meta?.changes ?? 0) > 0
}

export async function rows<T>(db: D1Database, sql: string, ...params: Array<string | number | null>): Promise<T[]> {
  return (
    await db
      .prepare(sql)
      .bind(...params)
      .all<T>()
  ).results
}

