import { ValidationError } from '../domain/application/validationError'

/**
 * The value of a query parameter that may be given once. A blank value counts as absent. Any parameter
 * outside `allowed` is refused, so a misspelt one is an error and not a request that quietly means
 * something else.
 */
export function singleParams(url: URL, allowed: readonly string[]): Record<string, string | undefined> {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key)) throw new ValidationError(`Unknown parameter: ${key}`)
  }
  const out: Record<string, string | undefined> = {}
  for (const key of allowed) {
    const values = url.searchParams.getAll(key).filter((value) => value !== '')
    if (values.length > 1) throw new ValidationError(`${key} was given more than once`)
    out[key] = values[0]
  }
  return out
}

/** `?from=YYYY-MM&to=YYYY-MM`, still unchecked: the application layer validates the values. */
export function monthRangeParams(url: URL): { from?: string; to?: string } {
  const { from, to } = singleParams(url, ['from', 'to'])
  return { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) }
}
