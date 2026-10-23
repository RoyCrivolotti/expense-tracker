import { HttpError } from './http'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** The one route whose body is a file: a multipart form writes its own boundary, so it has no JSON type to check. */
const MULTIPART_ROUTE = '/api/expenses/attachments'

/** `application/json` with or without parameters, in any case. */
function isJson(contentType: string | null): boolean {
  return (contentType ?? '').split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

/**
 * Whether the request carries nothing. workerd hands a body-less POST over with a body object of zero length and
 * `Content-Length: 0` (browsers send that header for a POST without a body), so the body object alone does not tell.
 */
function hasNoBody(request: Request): boolean {
  if (request.body === null) return true
  return request.headers.get('content-length') === '0' && !request.headers.has('transfer-encoding')
}

/**
 * Refuses a write that a page on another site could have caused. Authentication is the Access cookie, which a browser
 * sends with a form or a `fetch` from any site unless the cookie's SameSite setting says otherwise, and that setting is
 * not something this repo controls or tests. So a browser's own `Sec-Fetch-Site: cross-site` is a 403, and a write that
 * carries a body must say it is JSON: the types a page can send to another site without a preflight (`text/plain`,
 * form-urlencoded, multipart) are refused with a 415, and so is a body with no type. A write with no body (a delete,
 * a request for access) needs no type. A client that is not a browser sends no `Sec-Fetch-Site` and is not affected by the first rule.
 */
export function assertWriteIsSameSiteJson(request: Request, pathname: string): void {
  if (SAFE_METHODS.has(request.method)) return
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Cross-site requests are refused')
  }
  if (hasNoBody(request) || pathname === MULTIPART_ROUTE) return
  if (!isJson(request.headers.get('content-type'))) {
    throw new HttpError(415, 'The request body must be application/json')
  }
}
