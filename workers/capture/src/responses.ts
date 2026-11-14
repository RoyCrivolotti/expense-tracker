/**
 * Every answer is a fixed body with the same headers, so what a stranger sees reveals nothing about why a request
 * was refused. The one 401 is byte-identical whatever was wrong with the key. No `Access-Control-Allow-*` header is
 * ever sent: an `Authorization` header forces a preflight, which keeps browsers out.
 */
const HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' }

function reply(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...HEADERS, ...extra } })
}

export const ok = () => reply(200, '{"ok":true}')
export const unauthorized = () => reply(401, '{"error":"unauthorized"}')
export const badRequest = () => reply(400, '{"error":"bad request"}')
export const notFound = () => reply(404, '{"error":"not found"}')
export const methodNotAllowed = () => reply(405, '{"error":"method not allowed"}', { allow: 'POST' })
export const tooLarge = () => reply(413, '{"error":"too large"}')
export const unsupportedType = () => reply(415, '{"error":"unsupported media type"}')
export const tooManyRequests = () => reply(429, '{"error":"too many requests"}', { 'retry-after': '3600' })
/** No `Retry-After`: unlike a rate limit, this lasts until the person's counters are cleared. */
export const tooManySources = () => reply(429, '{"error":"too many requests"}')
export const serverError = () => reply(500, '{"error":"server error"}')
export const unavailable = () => reply(503, '{"error":"unavailable"}')
