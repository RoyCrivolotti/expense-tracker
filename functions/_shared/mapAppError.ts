import { HttpError } from './http'

/**
 * Matches any HTTP-shaped error carrying a numeric `status` (e.g. this repo's
 * test-only `RepoHttpError`, used by the in-memory repository) without this
 * production module importing test code to check `instanceof`.
 */
function hasHttpStatus(error: unknown): error is Error & { status: number } {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  )
}

/** Map application-layer validation errors to HTTP error responses. */
export function mapAppError(error: unknown): never {
  if (error instanceof HttpError) throw error
  if (hasHttpStatus(error)) throw new HttpError(error.status, error.message)
  if (error instanceof Error) throw new HttpError(400, error.message)
  throw new HttpError(400, 'Bad request')
}
