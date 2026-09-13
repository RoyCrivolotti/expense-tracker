export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export function error(status: number, message: string): Response {
  return json({ error: message }, status)
}

/** A thrown HttpError short-circuits a handler with an HTTP status + message. */
export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
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
