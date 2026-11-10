export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export function error(status: number, message: string, headers: Record<string, string> = {}): Response {
  const response = json({ error: message }, status)
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
  return response
}

/** A thrown HttpError short-circuits a handler with an HTTP status + message, and headers when it has any. */
export class HttpError extends Error {
  readonly status: number
  readonly headers: Record<string, string>
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

/** Mirrors readJson for the one route whose request body is binary. */
export async function readFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData()
  } catch {
    throw new HttpError(400, 'Invalid form body')
  }
}

/**
 * Largest JSON body a route reads unless it asks for more. The biggest body that is not a bulk create
 * is a bulk label link request (5,000 ids, about 50 KB); the rest are one record. Goal scenarios
 * carry life events and sit well under this too.
 */
export const DEFAULT_JSON_BODY_BYTES = 256 * 1024

/**
 * Bulk create takes up to 1,000 rows of at most 140 characters of description and 2,000 of notes. In
 * ASCII that is about 2.5 MB; at three bytes a character it is about 6.5 MB, so 8 MiB never refuses a
 * body the validator would have accepted.
 */
export const BULK_CREATE_BODY_BYTES = 8 * 1024 * 1024

const TOO_LARGE = 'Request body too large'

/**
 * Parses a JSON body, counting bytes as they arrive so an oversize body is refused with a 413 as
 * soon as it crosses `maxBytes`, without reading the rest. A declared `content-length` over the cap
 * is refused before the first byte is read.
 */
export async function readJson<T>(request: Request, maxBytes = DEFAULT_JSON_BODY_BYTES): Promise<T> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await request.body?.cancel().catch(() => undefined)
    throw new HttpError(413, TOO_LARGE)
  }
  const text = await readCappedText(request, maxBytes)
  let body: T | null
  try {
    body = JSON.parse(text) as T | null
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
  // `null` parses, and every route reads a field off the body next.
  if (body === null) throw new HttpError(400, 'Invalid JSON body')
  return body
}

async function readCappedText(request: Request, maxBytes: number): Promise<string> {
  if (request.body === null) return ''
  const reader: ReadableStreamDefaultReader<Uint8Array> = request.body.getReader() as ReadableStreamDefaultReader<Uint8Array>
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new HttpError(413, TOO_LARGE)
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}
