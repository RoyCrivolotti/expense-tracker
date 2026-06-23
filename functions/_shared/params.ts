import { HttpError } from './http'

/** Read a single route param value, tolerating string | string[] | undefined. */
export function routeParam(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value[0]) return value[0]
  return ''
}

/** Parse a positive integer route id, throwing 400 on bad input. */
export function parseNumericId(params: Record<string, string | string[]>, key = 'id'): number {
  const raw = routeParam(params[key])
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${key}`)
  return id
}
