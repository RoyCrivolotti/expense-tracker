/**
 * SQL text for the capture fix tool's record files. `wrangler d1 execute --file` takes no bound values, so every
 * value is written into the statement as a literal, and every statement is one line, so its `changes` can be read
 * back one by one.
 */

export type SqlValue = string | number | null

/** A value as an SQLite literal: text quoted with its quotes doubled, a whole number as digits, null as NULL. */
export function literal(value: SqlValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`not a whole number: ${value}`)
    return String(value)
  }
  return `'${value.replaceAll("'", "''")}'`
}

/** `column = value`, or `column IS NULL` for null, so a guard on a null column matches. */
export function equals(
  column: string,
  value: SqlValue,
): string {
  return value === null ? `${column} IS NULL` : `${column} = ${literal(value)}`
}

/** A guard that every column holds its value. */
export function allEqual(columns: Readonly<Record<string, SqlValue>>): string {
  return Object.entries(columns)
    .map(([column, value]) => equals(column, value))
    .join(' AND ')
}

/** `column = value, ...` for an UPDATE. */
export function assignments(columns: Readonly<Record<string, SqlValue>>): string {
  return Object.entries(columns)
    .map(([column, value]) => `${column} = ${literal(value)}`)
    .join(', ')
}

/** The statements as a file: one per line, each ending in a semicolon. */
export function sqlFile(statements: readonly string[]): string {
  return statements.map((s) => `${s};\n`).join('')
}
