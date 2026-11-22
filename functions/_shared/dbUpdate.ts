import { HttpError } from './http'

export type ColumnMap<T> = Record<keyof T, string>
export type Coerce<T> = (
  key: keyof T,
  value: unknown,
) => unknown

/** Build the SET clause + bound values for a partial update; rejects empty patches. */
export function buildUpdate<T>(
  columns: ColumnMap<T>,
  patch: Partial<T>,
  coerce: Coerce<T>,
) {
  const keys = (Object.keys(patch) as (keyof T)[]).filter((k) => Object.hasOwn(columns, k))
  if (keys.length === 0) throw new HttpError(400, 'Empty patch')
  return {
    sets: keys.map((k) => `${columns[k]} = ?`).join(', '),
    values: keys.map((k) => coerce(k, patch[k])),
  }
}
