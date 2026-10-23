/**
 * Headers every API response carries unless the route set its own. `no-store` because an answer from the API is one
 * person's data, and a route that wants it kept says so (the parts and the receipts do). `nosniff` so that a body is
 * never read as a type it did not declare.
 */
const DEFAULTS: ReadonlyArray<readonly [string, string]> = [
  ['cache-control', 'private, no-store'],
  ['x-content-type-options', 'nosniff'],
]

export function withDefaultResponseHeaders(response: Response): Response {
  if (DEFAULTS.every(([name]) => response.headers.has(name))) return response
  // A copy, since the headers of a response that came from `next()` may be immutable. The body is passed on unread.
  const copy = new Response(response.body, response)
  for (const [name, value] of DEFAULTS) {
    if (!copy.headers.has(name)) copy.headers.set(name, value)
  }
  return copy
}
