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

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json<T>()
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}
