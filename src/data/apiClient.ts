/** Thrown by `req` on a non-2xx response; `status` lets callers branch on e.g. 409 vs 404. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) message = body.error
  } catch {
    /* ignore */
  }
  return new ApiError(message, res.status)
}

/**
 * Multipart sibling of {@link req}, for the one endpoint whose request body is
 * binary. Deliberately sets no content-type: the browser has to write the
 * multipart boundary itself, and supplying one would corrupt the body.
 */
export async function reqMultipart<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', credentials: 'same-origin', body: form })
  if (!res.ok) throw await toApiError(res)
  return res.json() as Promise<T>
}

/** Shared JSON fetch wrapper for expense + access API clients. */
export async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) throw await toApiError(res)
  return res.json() as Promise<T>
}
